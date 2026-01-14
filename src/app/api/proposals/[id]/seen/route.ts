import { NextRequest, NextResponse } from "next/server";
import { markProposalViewerSeen, markProposalSeen, getRecentProposals } from "@/lib/db";
import { getProposal } from "@/lib/nns";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing proposal ID" },
        { status: 400 }
      );
    }

    await markProposalViewerSeen(id);

    // Check if we have the proposal timestamp stored, if not, fetch and store it
    const proposals = await getRecentProposals(1);
    const existingProposal = proposals.find(p => p.proposal_id === id);

    if (existingProposal && !existingProposal.proposal_timestamp) {
      // Fetch full proposal details to get timestamp
      const proposalDetail = await getProposal(BigInt(id));
      if (proposalDetail) {
        const proposalTimestamp = new Date(Number(proposalDetail.proposalTimestampSeconds) * 1000);
        await markProposalSeen(
          id,
          existingProposal.topic,
          existingProposal.title || "Untitled",
          existingProposal.commit_hash,
          existingProposal.proposal_url,
          proposalTimestamp
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark proposal as seen:", error);
    return NextResponse.json(
      { error: "Failed to mark proposal as seen" },
      { status: 500 }
    );
  }
}
