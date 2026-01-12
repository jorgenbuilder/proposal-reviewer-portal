import { NextResponse } from "next/server";
import { getRecentProposals } from "@/lib/db";

export async function GET() {
  try {
    const proposals = await getRecentProposals(50);

    return NextResponse.json({
      proposals: proposals.map((p) => ({
        id: p.proposal_id,
        title: p.title || "Untitled",
        topic: p.topic,
        seenAt: p.seen_at,
        notified: p.notified,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch proposals:", error);

    // Return empty array if table doesn't exist yet
    return NextResponse.json({ proposals: [] });
  }
}
