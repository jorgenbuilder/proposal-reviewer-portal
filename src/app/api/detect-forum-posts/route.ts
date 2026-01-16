import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import {
  getRecentProposals,
  getProposalsWithoutCanonicalForum,
  getForumCookies,
  addForumThread,
  logForumSearch,
} from "@/lib/db";

const FORUM_BASE_URL = "https://forum.dfinity.org";
const NNS_CATEGORY_ID = 76;

interface DiscourseSearchResponse {
  topics?: Array<{
    id: number;
    title: string;
    slug: string;
    category_id: number;
  }>;
}

interface ForumThreadResult {
  url: string;
  title: string;
  found: boolean;
  error?: string;
}

// Verify QStash signature
async function verifyQStashSignature(
  signature: string | null,
  body: string
): Promise<boolean> {
  const qstashCurrentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const qstashNextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!qstashCurrentSigningKey || !qstashNextSigningKey) {
    console.warn("QStash signing keys not configured");
    return false;
  }

  if (!signature) {
    return false;
  }

  const receiver = new Receiver({
    currentSigningKey: qstashCurrentSigningKey,
    nextSigningKey: qstashNextSigningKey,
  });

  try {
    await receiver.verify({
      signature,
      body,
    });
    return true;
  } catch {
    return false;
  }
}

// Search the forum for a proposal
async function searchForum(
  proposalId: string,
  cookies: string
): Promise<DiscourseSearchResponse> {
  const searchUrl = `${FORUM_BASE_URL}/search.json?q=${encodeURIComponent(proposalId)}`;

  const response = await fetch(searchUrl, {
    headers: {
      Cookie: cookies,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Forum search failed: HTTP ${response.status}`);
  }

  return await response.json();
}

// Verify a thread contains the proposal ID in its first post
async function verifyThread(
  topicId: number,
  slug: string,
  proposalId: string,
  cookies: string
): Promise<boolean> {
  const threadUrl = `${FORUM_BASE_URL}/t/${slug}/${topicId}.json`;

  const response = await fetch(threadUrl, {
    headers: {
      Cookie: cookies,
      Accept: "application/json",
    },
  });

  if (!response.ok) return false;

  const data = await response.json();
  const firstPost = data.post_stream?.posts?.[0];

  if (!firstPost) return false;

  // Check if proposal ID appears in first post
  const postText = firstPost.cooked || firstPost.raw || "";
  return postText.includes(proposalId);
}

// Find the canonical forum thread for a proposal
async function findForumThread(
  proposalId: string,
  cookies: string
): Promise<ForumThreadResult> {
  try {
    // Search forum
    const searchResults = await searchForum(proposalId, cookies);

    if (!searchResults.topics || searchResults.topics.length === 0) {
      return {
        url: "",
        title: "",
        found: false,
        error: "No search results found",
      };
    }

    // Filter to NNS category
    const nnsThreads = searchResults.topics.filter(
      (t) => t.category_id === NNS_CATEGORY_ID
    );

    if (nnsThreads.length === 0) {
      return {
        url: "",
        title: "",
        found: false,
        error: `Found ${searchResults.topics.length} results but none in NNS category`,
      };
    }

    // Verify each thread
    for (const thread of nnsThreads) {
      const isValid = await verifyThread(
        thread.id,
        thread.slug,
        proposalId,
        cookies
      );

      if (isValid) {
        const url = `${FORUM_BASE_URL}/t/${thread.slug}/${thread.id}`;
        return {
          url,
          title: thread.title,
          found: true,
        };
      }
    }

    // No verified threads
    return {
      url: "",
      title: "",
      found: false,
      error: `Found ${nnsThreads.length} potential threads but none contained proposal ID`,
    };
  } catch (error) {
    return {
      url: "",
      title: "",
      found: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function POST(request: NextRequest) {
  // Verify QStash signature or check for cron secret
  const authHeader = request.headers.get("authorization");
  const signature = request.headers.get("upstash-signature");
  const body = await request.text();
  const cronSecret = process.env.CRON_SECRET;
  const isAuthorizedCron =
    cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isQStashRequest = await verifyQStashSignature(signature, body);

  if (!isAuthorizedCron && !isQStashRequest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get forum cookies
    const cookies = await getForumCookies();
    if (!cookies) {
      console.warn("[detect-forum-posts] No forum cookies configured");
      return NextResponse.json(
        { error: "Forum cookies not configured" },
        { status: 503 }
      );
    }

    // Get recent proposals
    const proposals = await getRecentProposals(100);
    const proposalIds = proposals.map((p) => p.proposal_id);

    // Filter to those without canonical forum threads
    const needsForumSearch = await getProposalsWithoutCanonicalForum(proposalIds);

    console.log(
      `[detect-forum-posts] Checking ${needsForumSearch.length} proposals without canonical forum posts`
    );

    const results: {
      found: string[];
      notFound: string[];
      errors: { proposalId: string; error: string }[];
    } = {
      found: [],
      notFound: [],
      errors: [],
    };

    for (const proposalId of needsForumSearch) {
      try {
        const result = await findForumThread(proposalId, cookies);

        if (result.found) {
          // Save as canonical forum thread
          await addForumThread(proposalId, result.url, result.title, true);
          results.found.push(proposalId);

          // Log successful search
          await logForumSearch(
            proposalId,
            proposalId,
            1,
            result.url,
            "success"
          );

          console.log(
            `[detect-forum-posts] Found forum thread for ${proposalId}: ${result.url}`
          );
        } else {
          results.notFound.push(proposalId);

          // Log no results
          await logForumSearch(
            proposalId,
            proposalId,
            0,
            null,
            "no_results",
            result.error
          );
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        results.errors.push({ proposalId, error: errorMsg });

        // Log error
        await logForumSearch(proposalId, proposalId, 0, null, "error", errorMsg);

        console.error(
          `[detect-forum-posts] Error searching for ${proposalId}:`,
          error
        );
      }
    }

    return NextResponse.json({
      success: true,
      checked: needsForumSearch.length,
      found: results.found.length,
      notFound: results.notFound.length,
      errors: results.errors.length,
      details: results,
    });
  } catch (error) {
    console.error("[detect-forum-posts] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Create a mock request with the same headers
  const mockRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
  });

  return POST(mockRequest);
}
