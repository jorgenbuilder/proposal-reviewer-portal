import { NextRequest, NextResponse } from "next/server";
import {
  addForumThread,
  removeForumThread,
  getForumThreadsForProposal,
} from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://forum.dfinity.org",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsResponse(response: NextResponse): NextResponse {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.FORUM_LINK_SECRET;

  if (!secret) {
    console.warn("FORUM_LINK_SECRET not configured");
    return false;
  }

  return authHeader === `Bearer ${secret}`;
}

// Handle CORS preflight
export async function OPTIONS() {
  return corsResponse(new NextResponse(null, { status: 204 }));
}

// GET: Fetch forum threads for a proposal (public)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const proposalId = searchParams.get("proposalId");

  if (!proposalId) {
    return corsResponse(
      NextResponse.json(
        { error: "Missing required parameter: proposalId" },
        { status: 400 }
      )
    );
  }

  try {
    const threads = await getForumThreadsForProposal(proposalId);
    return corsResponse(NextResponse.json({ threads }));
  } catch (error) {
    console.error("Failed to fetch forum threads:", error);
    return corsResponse(
      NextResponse.json(
        { error: "Failed to fetch forum threads" },
        { status: 500 }
      )
    );
  }
}

// POST: Add a forum thread link (requires auth)
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return corsResponse(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }

  try {
    const body = await request.json();
    const { proposalId, forumUrl, threadTitle, isCanonical } = body as {
      proposalId?: string;
      forumUrl?: string;
      threadTitle?: string;
      isCanonical?: boolean;
    };

    if (!proposalId || !forumUrl) {
      return corsResponse(
        NextResponse.json(
          { error: "Missing required fields: proposalId, forumUrl" },
          { status: 400 }
        )
      );
    }

    // Validate URL is from DFINITY forum
    if (!forumUrl.includes("forum.dfinity.org")) {
      return corsResponse(
        NextResponse.json(
          { error: "URL must be from forum.dfinity.org" },
          { status: 400 }
        )
      );
    }

    const thread = await addForumThread(proposalId, forumUrl, threadTitle, isCanonical);
    return corsResponse(NextResponse.json({ success: true, thread }));
  } catch (error) {
    console.error("Failed to add forum thread:", error);
    return corsResponse(
      NextResponse.json(
        { error: "Failed to add forum thread" },
        { status: 500 }
      )
    );
  }
}

// DELETE: Remove a forum thread link (requires auth)
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return corsResponse(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }

  try {
    const body = await request.json();
    const { proposalId, forumUrl } = body as {
      proposalId?: string;
      forumUrl?: string;
    };

    if (!proposalId || !forumUrl) {
      return corsResponse(
        NextResponse.json(
          { error: "Missing required fields: proposalId, forumUrl" },
          { status: 400 }
        )
      );
    }

    await removeForumThread(proposalId, forumUrl);
    return corsResponse(NextResponse.json({ success: true }));
  } catch (error) {
    console.error("Failed to remove forum thread:", error);
    return corsResponse(
      NextResponse.json(
        { error: "Failed to remove forum thread" },
        { status: 500 }
      )
    );
  }
}
