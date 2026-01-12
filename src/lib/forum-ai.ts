import { GoogleGenAI } from "@google/genai";

const FORUM_BASE_URL = "https://forum.dfinity.org";
const NNS_PROPOSAL_CATEGORY_ID = 76;

export interface ForumTopic {
  id: number;
  title: string;
  slug: string;
  url: string;
  createdAt: string;
}

export interface ForumSearchResult {
  found: boolean;
  topic?: ForumTopic;
  confidence?: "high" | "medium" | "low";
  reason?: string;
}

interface RawForumTopic {
  id: number;
  title: string;
  slug: string;
  created_at: string;
  excerpt?: string;
  tags?: string[];
}

interface ForumTopicWithContent extends RawForumTopic {
  content: string;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  retries = 3,
  delayMs = 1000
): Promise<Response | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      console.log(`[Forum] Fetching: ${url} (attempt ${attempt + 1}/${retries})`);

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ICP-Proposal-Reviewer/1.0",
        },
        next: { revalidate: 300 },
      });

      console.log(`[Forum] Response status: ${response.status}`);

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : delayMs * (attempt + 1);
        console.log(`[Forum] Rate limited, waiting ${waitTime}ms before retry`);
        await delay(waitTime);
        continue;
      }

      if (!response.ok) {
        console.error(`[Forum] HTTP error: ${response.status} ${response.statusText}`);
        return null;
      }

      return response;
    } catch (error) {
      console.error(`[Forum] Fetch error on attempt ${attempt + 1}:`, error);
      if (attempt < retries - 1) {
        await delay(delayMs * (attempt + 1));
      }
    }
  }
  return null;
}

async function fetchRecentTopics(
  beforeDate: Date,
  afterDate: Date
): Promise<RawForumTopic[]> {
  const topics: RawForumTopic[] = [];
  let page = 0;
  const maxPages = 3; // Reduced to avoid rate limits

  console.log(`[Forum] Searching for topics between ${afterDate.toISOString()} and ${beforeDate.toISOString()}`);

  while (page < maxPages) {
    const url = `${FORUM_BASE_URL}/c/governance/nns-proposal-discussions/${NNS_PROPOSAL_CATEGORY_ID}.json?page=${page}`;
    const response = await fetchWithRetry(url);

    if (!response) {
      console.error(`[Forum] Failed to fetch page ${page}, stopping`);
      break;
    }

    const data = await response.json();
    const pageTopics = data.topic_list?.topics || [];

    console.log(`[Forum] Page ${page}: found ${pageTopics.length} topics`);

    if (pageTopics.length === 0) break;

    for (const topic of pageTopics) {
      const createdAt = new Date(topic.created_at);

      // Skip topics created after our search window
      if (createdAt > beforeDate) continue;

      // Stop if we've gone past our search window
      if (createdAt < afterDate) {
        console.log(`[Forum] Reached end of search window, found ${topics.length} topics total`);
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

    // Add delay between pages to avoid rate limiting
    if (page < maxPages) {
      await delay(500);
    }
  }

  console.log(`[Forum] Finished searching, found ${topics.length} topics total`);
  return topics;
}

async function fetchTopicContent(topicId: number): Promise<string> {
  const url = `${FORUM_BASE_URL}/t/${topicId}.json`;
  const response = await fetchWithRetry(url, 2, 500);

  if (!response) {
    console.log(`[Forum] Could not fetch content for topic ${topicId}`);
    return "";
  }

  try {
    const data = await response.json();
    const firstPost = data.post_stream?.posts?.[0];

    if (firstPost?.cooked) {
      const content = firstPost.cooked
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 3000);
      console.log(`[Forum] Fetched content for topic ${topicId}: ${content.length} chars`);
      return content;
    }

    return "";
  } catch (error) {
    console.error(`[Forum] Error parsing topic ${topicId} content:`, error);
    return "";
  }
}

export async function findForumTopicWithAI(
  proposalId: string,
  proposalTitle: string,
  proposalTopic?: string,
  proposalCreatedAt?: Date
): Promise<ForumSearchResult> {
  console.log(`[Forum] Starting AI search for proposal ${proposalId}: "${proposalTitle}"`);

  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    console.warn("[Forum] GEMINI_API_KEY not configured, skipping AI forum search");
    return { found: false, reason: "AI search not configured" };
  }

  try {
    // Calculate search window: from 7 days before now (proposals may not have creation date)
    const searchBefore = new Date();
    const searchAfter = new Date();
    searchAfter.setDate(searchAfter.getDate() - 7);

    console.log(`[Forum] Search window: ${searchAfter.toISOString()} to ${searchBefore.toISOString()}`);

    // Fetch recent topics from the forum
    const topics = await fetchRecentTopics(searchBefore, searchAfter);

    if (topics.length === 0) {
      console.log("[Forum] No topics found in search window");
      return {
        found: false,
        reason: "No recent forum topics found in the search window",
      };
    }

    console.log(`[Forum] Found ${topics.length} candidate topics`);

    // Prioritize topics with matching tags or proposal ID in title
    const prioritizedTopics = topics.sort((a, b) => {
      const aHasId = a.title.includes(proposalId) ? 1 : 0;
      const bHasId = b.title.includes(proposalId) ? 1 : 0;
      const aHasTag =
        proposalTopic &&
        a.tags?.some((t) => t.toLowerCase().includes("canister"))
          ? 1
          : 0;
      const bHasTag =
        proposalTopic &&
        b.tags?.some((t) => t.toLowerCase().includes("canister"))
          ? 1
          : 0;
      return bHasId + bHasTag - (aHasId + aHasTag);
    });

    // Take top candidates and fetch their content (reduced to 8 to avoid rate limits)
    const candidates = prioritizedTopics.slice(0, 8);
    const topicsWithContent: ForumTopicWithContent[] = [];

    console.log(`[Forum] Fetching content for ${candidates.length} top candidates`);

    for (const topic of candidates) {
      const content = await fetchTopicContent(topic.id);
      topicsWithContent.push({ ...topic, content });
      // Add small delay between content fetches
      await delay(300);
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

    console.log(`[Forum] Sending ${topicsWithContent.length} topics to Gemini for analysis`);

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: prompt,
    });

    const text = response.text || "";
    console.log(`[Forum] Gemini response: ${text.slice(0, 500)}`);

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[Forum] Failed to parse JSON from Gemini response");
      return { found: false, reason: "Failed to parse AI response" };
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`[Forum] Parsed result:`, result);

    if (result.found && result.topicId) {
      const matchedTopic = topicsWithContent.find(
        (t) => t.id === result.topicId
      );
      if (matchedTopic) {
        console.log(`[Forum] Found match: ${matchedTopic.title}`);
        return {
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
        };
      }
    }

    console.log(`[Forum] No match found. Reason: ${result.reason}`);
    return {
      found: false,
      confidence: result.confidence,
      reason: result.reason,
    };
  } catch (error) {
    console.error("[Forum] AI forum search error:", error);
    return { found: false, reason: "AI search failed" };
  }
}
