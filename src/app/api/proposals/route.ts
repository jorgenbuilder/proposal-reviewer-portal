import { NextResponse } from "next/server";
import { getRecentProposals } from "@/lib/db";
import { getVerificationStatusForProposals, VerificationStatus } from "@/lib/github";

export interface ProposalResponse {
  id: string;
  title: string;
  topic: string;
  seenAt: Date;
  notified: boolean;
  commitHash: string | null;
  proposalUrl: string | null;
  verificationStatus: VerificationStatus;
  verificationRunUrl: string | null;
}

export async function GET() {
  try {
    const proposals = await getRecentProposals(50);
    const proposalIds = proposals.map((p) => p.proposal_id);

    // Batch fetch verification statuses
    const verificationMap = await getVerificationStatusForProposals(proposalIds);

    return NextResponse.json({
      proposals: proposals.map((p): ProposalResponse => {
        const verification = verificationMap.get(p.proposal_id);
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
        };
      }),
    });
  } catch (error) {
    console.error("Failed to fetch proposals:", error);

    // Return empty array if table doesn't exist yet
    return NextResponse.json({ proposals: [] });
  }
}
