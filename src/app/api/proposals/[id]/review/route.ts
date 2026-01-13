import { NextRequest, NextResponse } from "next/server";
import { submitProposalReview, clearProposalReview } from "@/lib/db";

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

    const body = await request.json();
    const { forumUrl, reviewedAt } = body as {
      forumUrl?: string;
      reviewedAt?: string;
    };

    if (!forumUrl) {
      return NextResponse.json(
        { error: "Missing required field: forumUrl" },
        { status: 400 }
      );
    }

    // Validate URL is from DFINITY forum
    if (!forumUrl.includes("forum.dfinity.org")) {
      return NextResponse.json(
        { error: "URL must be from forum.dfinity.org" },
        { status: 400 }
      );
    }

    await submitProposalReview(id, forumUrl, reviewedAt);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to submit review:", error);
    return NextResponse.json(
      { error: "Failed to submit review" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await clearProposalReview(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to clear review:", error);
    return NextResponse.json(
      { error: "Failed to clear review" },
      { status: 500 }
    );
  }
}
