import { NextRequest, NextResponse } from "next/server";
import { getRecentProposals, getLatestCommentaryTitles, getForumThreadsForProposals, getProposalReviewStatus } from "@/lib/db";
import { getVerificationStatusForProposals, VerificationStatus } from "@/lib/github";
import { getHubStatusMap, type HubStatus } from "@/lib/review-hub";

export interface ProposalResponse {
  id: string;
  title: string;
  topic: string;
  seenAt: string;
  notified: boolean;
  commitHash: string | null;
  proposalUrl: string | null;
  verificationStatus: VerificationStatus;
  verificationRunUrl: string | null;
  viewerSeenAt: string | null;
  reviewForumUrl: string | null;
  reviewedAt: string | null;
  commentaryTitle: string | null;
  forumThreadUrl: string | null;
  proposalTimestamp: string | null;
  linesAdded: number | null;
  linesRemoved: number | null;
  hub: HubStatus | null;
}

export async function GET(request: NextRequest) {
  // Single-proposal review status (used by the detail page's review widget). Without this,
  // `?proposalId=` was ignored and the full list was returned, so the widget never saw a
  // `reviewForumUrl` and always rendered the submission form even after a post existed.
  const proposalId = request.nextUrl.searchParams.get("proposalId");
  if (proposalId) {
    try {
      const status = await getProposalReviewStatus(proposalId);
      return NextResponse.json(
        status ?? { viewerSeenAt: null, reviewForumUrl: null, reviewedAt: null }
      );
    } catch (error) {
      console.error(`Failed to fetch review status for ${proposalId}:`, error);
      return NextResponse.json(
        { error: "Failed to fetch review status" },
        { status: 500 }
      );
    }
  }

  try {
    const proposals = await getRecentProposals(50);
    const proposalIds = proposals.map((p) => p.proposal_id);

    // Batch fetch verification statuses, commentary titles, forum threads, and
    // review-hub status (one set of canister reads for the whole list).
    const [verificationMap, commentaryTitleMap, forumThreadsMap, hubMap] = await Promise.all([
      getVerificationStatusForProposals(proposalIds),
      getLatestCommentaryTitles(proposalIds),
      getForumThreadsForProposals(proposalIds),
      getHubStatusMap(),
    ]);

    return NextResponse.json({
      proposals: proposals.map((p): ProposalResponse => {
        const verification = verificationMap.get(p.proposal_id);
        const commentaryTitle = commentaryTitleMap.get(p.proposal_id);
        const forumThreads = forumThreadsMap.get(p.proposal_id);
        // Get the first (most recent) thread URL if any exist
        const forumThreadUrl = forumThreads && forumThreads.length > 0 ? forumThreads[0].forum_url : null;
        return {
          id: p.proposal_id,
          title: p.title || "Untitled",
          topic: p.topic,
          seenAt: p.seen_at,
          notified: p.notified,
          commitHash: p.commit_hash,
          proposalUrl: p.proposal_url,
          verificationStatus: verification?.status || "pending",
          verificationRunUrl: verification?.runUrl || null,
          viewerSeenAt: p.viewer_seen_at,
          reviewForumUrl: p.review_forum_url,
          reviewedAt: p.reviewed_at,
          commentaryTitle: commentaryTitle || null,
          forumThreadUrl,
          proposalTimestamp: p.proposal_timestamp,
          linesAdded: p.lines_added ?? null,
          linesRemoved: p.lines_removed ?? null,
          hub: hubMap.get(p.proposal_id) ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Failed to fetch proposals:", error);

    // Return empty array if table doesn't exist yet
    return NextResponse.json({ proposals: [] });
  }
}
