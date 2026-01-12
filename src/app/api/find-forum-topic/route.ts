import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const FORUM_BASE_URL = "https://forum.dfinity.org";
const NNS_PROPOSAL_CATEGORY_ID = 76;

interface ForumTopic {
  id: number;
  title: string;
  slug: string;
  created_at: string;
  excerpt?: string;
  tags?: string[];
}

interface ForumTopicWithContent extends ForumTopic {
  content: string;
}

async function fetchRecentTopics(
  beforeDate: Date,
  afterDate: Date
): Promise<ForumTopic[]> {
  const topics: ForumTopic[] = [];
  let page = 0;
  const maxPages = 5;

  while (page < maxPages) {
    try {
      const url = `${FORUM_BASE_URL}/c/governance/nns-proposal-discussions/${NNS_PROPOSAL_CATEGORY_ID}.json?page=${page}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        console.error("Failed to fetch forum topics:", response.status);
        break;
      }

      const data = await response.json();
      const pageTopics = data.topic_list?.topics || [];

      if (pageTopics.length === 0) break;

      for (const topic of pageTopics) {
        const createdAt = new Date(topic.created_at);

        // Skip topics created after our search window
        if (createdAt > beforeDate) continue;

        // Stop if we've gone past our search window
        if (createdAt < afterDate) {
          return topics;
        }

        topics.push({
          id: topic.id,
          title: topic.title,
          slug: topic.slug,
          created_at: topic.created_at,
          excerpt: topic.excerpt,
          tags: topic.tags,
        });
      }

      page++;
    } catch (error) {
      console.error("Error fetching forum page:", error);
      break;
    }
  }

  return topics;
}

async function fetchTopicContent(topicId: number): Promise<string> {
  try {
    const url = `${FORUM_BASE_URL}/t/${topicId}.json`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    const firstPost = data.post_stream?.posts?.[0];

    if (firstPost?.cooked) {
      // Strip HTML tags to get plain text
      return firstPost.cooked
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 3000); // Limit content length
    }

    return "";
  } catch (error) {
    console.error("Error fetching topic content:", error);
    return "";
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const proposalId = searchParams.get("proposalId");
  const proposalTitle = searchParams.get("title");
  const proposalTopic = searchParams.get("topic");
  const proposalCreatedAt = searchParams.get("createdAt");

  if (!proposalId || !proposalTitle) {
    return NextResponse.json(
      { error: "Missing required parameters: proposalId, title" },
      { status: 400 }
    );
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured" },
      { status: 500 }
    );
  }

  try {
    // Calculate search window: from 2 days before proposal creation to now
    const proposalDate = proposalCreatedAt
      ? new Date(proposalCreatedAt)
      : new Date();
    const searchAfter = new Date(proposalDate);
    searchAfter.setDate(searchAfter.getDate() - 2); // 2 days before
    const searchBefore = new Date(); // Now

    // Fetch recent topics from the forum
    const topics = await fetchRecentTopics(searchBefore, searchAfter);

    if (topics.length === 0) {
      return NextResponse.json({
        found: false,
        message: "No recent forum topics found in the search window",
      });
    }

    // Prioritize topics with matching tags or proposal ID in title
    const prioritizedTopics = topics.sort((a, b) => {
      const aHasId = a.title.includes(proposalId) ? 1 : 0;
      const bHasId = b.title.includes(proposalId) ? 1 : 0;
      const aHasTag =
        proposalTopic && a.tags?.some((t) => t.toLowerCase().includes("canister"))
          ? 1
          : 0;
      const bHasTag =
        proposalTopic && b.tags?.some((t) => t.toLowerCase().includes("canister"))
          ? 1
          : 0;
      return bHasId + bHasTag - (aHasId + aHasTag);
    });

    // Take top candidates and fetch their content
    const candidates = prioritizedTopics.slice(0, 15);
    const topicsWithContent: ForumTopicWithContent[] = [];

    for (const topic of candidates) {
      const content = await fetchTopicContent(topic.id);
      topicsWithContent.push({ ...topic, content });
    }

    // Build the prompt for Gemini
    const prompt = `You are helping match an ICP (Internet Computer Protocol) governance proposal to its corresponding forum discussion thread.

PROPOSAL DETAILS:
- Proposal ID: ${proposalId}
- Title: ${proposalTitle}
${proposalTopic ? `- Topic/Category: ${proposalTopic}` : ""}

CANDIDATE FORUM THREADS:
${topicsWithContent
  .map(
    (t, i) => `
--- Thread ${i + 1} ---
ID: ${t.id}
Title: ${t.title}
Tags: ${t.tags?.join(", ") || "none"}
Created: ${t.created_at}
Content Preview:
${t.content.slice(0, 1500)}
`
  )
  .join("\n")}

TASK:
Analyze the candidate forum threads and identify which one (if any) is the official discussion thread for Proposal #${proposalId}.

Look for:
1. The proposal ID mentioned in the title or content
2. Similar or matching proposal titles
3. Discussion of the same canister upgrade or governance action
4. References to the proposal URL or NNS dashboard link

IMPORTANT: Only return a match if you are confident it's the correct thread. Forum threads often discuss proposals, so make sure it's THE thread for THIS specific proposal, not just a thread that mentions it.

Respond in JSON format only:
{
  "found": true/false,
  "topicId": <number or null>,
  "confidence": "high" | "medium" | "low",
  "reason": "<brief explanation>"
}`;

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
    });

    const text = response.text || "";

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        found: false,
        message: "Failed to parse Gemini response",
      });
    }

    const result = JSON.parse(jsonMatch[0]);

    if (result.found && result.topicId) {
      const matchedTopic = topicsWithContent.find(
        (t) => t.id === result.topicId
      );
      if (matchedTopic) {
        return NextResponse.json({
          found: true,
          topic: {
            id: matchedTopic.id,
            title: matchedTopic.title,
            slug: matchedTopic.slug,
            url: `${FORUM_BASE_URL}/t/${matchedTopic.slug}/${matchedTopic.id}`,
            createdAt: matchedTopic.created_at,
          },
          confidence: result.confidence,
          reason: result.reason,
        });
      }
    }

    return NextResponse.json({
      found: false,
      confidence: result.confidence,
      reason: result.reason,
    });
  } catch (error) {
    console.error("Forum topic finder error:", error);
    return NextResponse.json(
      { error: "Failed to find forum topic" },
      { status: 500 }
    );
  }
}
