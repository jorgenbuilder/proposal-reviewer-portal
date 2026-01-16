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
  console.log(`[detect-forum-posts] [${proposalId}] Searching: ${searchUrl}`);

  const response = await fetch(searchUrl, {
    headers: {
      Cookie: cookies,
      Accept: "application/json",
    },
  });

  console.log(
    `[detect-forum-posts] [${proposalId}] Search response: ${response.status} ${response.statusText}`
  );

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `[detect-forum-posts] [${proposalId}] Search failed body: ${body.slice(0, 500)}`
    );
    throw new Error(`Forum search failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log(
    `[detect-forum-posts] [${proposalId}] Search returned ${data.topics?.length ?? 0} topics`
  );
  return data;
}

// Verify a thread contains the proposal ID in its first post
async function verifyThread(
  topicId: number,
  slug: string,
  proposalId: string,
  cookies: string
): Promise<boolean> {
  const threadUrl = `${FORUM_BASE_URL}/t/${slug}/${topicId}.json`;
  console.log(
    `[detect-forum-posts] [${proposalId}] Verifying thread: ${threadUrl}`
  );

  const response = await fetch(threadUrl, {
    headers: {
      Cookie: cookies,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.log(
      `[detect-forum-posts] [${proposalId}] Thread fetch failed: ${response.status}`
    );
    return false;
  }

  const data = await response.json();
  const firstPost = data.post_stream?.posts?.[0];

  if (!firstPost) {
    console.log(
      `[detect-forum-posts] [${proposalId}] No first post found in thread ${topicId}`
    );
    return false;
  }

  // Check if proposal ID appears in first post
  const postText = firstPost.cooked || firstPost.raw || "";
  const found = postText.includes(proposalId);
  console.log(
    `[detect-forum-posts] [${proposalId}] Thread ${topicId} verification: ${found ? "MATCH" : "no match"} (post length: ${postText.length})`
  );
  return found;
}

// Find the canonical forum thread for a proposal
async function findForumThread(
  proposalId: string,
  cookies: string
): Promise<ForumThreadResult> {
  console.log(`[detect-forum-posts] [${proposalId}] Starting forum search`);

  try {
    // Search forum
    const searchResults = await searchForum(proposalId, cookies);

    if (!searchResults.topics || searchResults.topics.length === 0) {
      console.log(
        `[detect-forum-posts] [${proposalId}] No topics in search results`
      );
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

    // Log all categories found for debugging
    const categoryIds = [
      ...new Set(searchResults.topics.map((t) => t.category_id)),
    ];
    console.log(
      `[detect-forum-posts] [${proposalId}] Categories found: ${categoryIds.join(", ")} (looking for ${NNS_CATEGORY_ID})`
    );
    console.log(
      `[detect-forum-posts] [${proposalId}] ${nnsThreads.length}/${searchResults.topics.length} topics in NNS category`
    );

    if (nnsThreads.length === 0) {
      // Log the titles we found for debugging
      const titles = searchResults.topics.slice(0, 3).map((t) => t.title);
      console.log(
        `[detect-forum-posts] [${proposalId}] Sample non-NNS topics: ${JSON.stringify(titles)}`
      );
      return {
        url: "",
        title: "",
        found: false,
        error: `Found ${searchResults.topics.length} results but none in NNS category (categories: ${categoryIds.join(", ")})`,
      };
    }

    // Log NNS threads we're about to verify
    console.log(
      `[detect-forum-posts] [${proposalId}] NNS threads to verify: ${nnsThreads.map((t) => `${t.id}:${t.title.slice(0, 50)}`).join(", ")}`
    );

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
        console.log(
          `[detect-forum-posts] [${proposalId}] Found valid thread: ${url}`
        );
        return {
          url,
          title: thread.title,
          found: true,
        };
      }
    }

    // No verified threads
    console.log(
      `[detect-forum-posts] [${proposalId}] No threads passed verification`
    );
    return {
      url: "",
      title: "",
      found: false,
      error: `Found ${nnsThreads.length} potential threads but none contained proposal ID`,
    };
  } catch (error) {
    console.error(
      `[detect-forum-posts] [${proposalId}] Exception during search:`,
      error
    );
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
    console.log(
      `[detect-forum-posts] Forum cookies loaded (length: ${cookies.length})`
    );

    // Get recent proposals
    const proposals = await getRecentProposals(100);
    const proposalIds = proposals.map((p) => p.proposal_id);
    console.log(
      `[detect-forum-posts] Got ${proposals.length} recent proposals`
    );

    // Filter to those without canonical forum threads
    const needsForumSearch = await getProposalsWithoutCanonicalForum(proposalIds);

    console.log(
      `[detect-forum-posts] Checking ${needsForumSearch.length} proposals without canonical forum posts`
    );
    if (needsForumSearch.length > 0) {
      console.log(
        `[detect-forum-posts] Proposals to check: ${needsForumSearch.join(", ")}`
      );
    }

    const results: {
      found: string[];
      notFound: string[];
      errors: { proposalId: string; error: string }[];
    } = {
      found: [],
      notFound: [],
      errors: [],
    };

    for (let i = 0; i < needsForumSearch.length; i++) {
      const proposalId = needsForumSearch[i];
      console.log(
        `[detect-forum-posts] Processing ${i + 1}/${needsForumSearch.length}: proposal ${proposalId}`
      );
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

          console.log(
            `[detect-forum-posts] No forum thread found for ${proposalId}: ${result.error}`
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

    console.log(
      `[detect-forum-posts] Complete: ${results.found.length} found, ${results.notFound.length} not found, ${results.errors.length} errors`
    );

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
