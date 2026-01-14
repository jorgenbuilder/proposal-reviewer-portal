import { NextRequest, NextResponse } from "next/server";
import { markProposalViewerSeen } from "@/lib/db";

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to mark proposal as seen:", error);
    return NextResponse.json(
      { error: "Failed to mark proposal as seen" },
      { status: 500 }
    );
  }
}
