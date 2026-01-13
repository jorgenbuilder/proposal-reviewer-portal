import { NextRequest, NextResponse } from "next/server"
import { saveCommentary, getLatestCommentary } from "@/lib/db"
import type { CommentaryData } from "@/types/commentary"

// Verify COMMENTARY_SECRET authentication
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization")
  const commentarySecret = process.env.COMMENTARY_SECRET

  if (!commentarySecret) {
    console.error("[commentary] COMMENTARY_SECRET not configured")
    return false
  }

  // Check Bearer token
  if (authHeader === `Bearer ${commentarySecret}`) {
    return true
  }

  return false
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Verify authentication
    if (!verifyAuth(request)) {
      console.warn("[commentary] Unauthorized attempt to post commentary")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: "Missing proposal ID" },
        { status: 400 }
      )
    }

    // 2. Parse request body
    const body = await request.json()
    const { commentary, metadata } = body as {
      commentary: CommentaryData
      metadata?: {
        cost_usd?: number
        duration_ms?: number
        turns?: number
      }
    }

    // 3. Validate required fields
    if (!commentary) {
      return NextResponse.json(
        { error: "Missing commentary data" },
        { status: 400 }
      )
    }

    if (!commentary.overall_summary || !commentary.sources) {
      return NextResponse.json(
        { error: "Invalid commentary: missing required fields (overall_summary, sources)" },
        { status: 400 }
      )
    }

    // Validate proposal_id matches
    if (commentary.proposal_id !== id) {
      return NextResponse.json(
        { error: "Proposal ID mismatch between URL and commentary data" },
        { status: 400 }
      )
    }

    // 4. Save to database
    const saved = await saveCommentary(id, commentary, metadata)

    console.log(`[commentary] Saved commentary for proposal ${id}`, {
      incomplete: commentary.analysis_incomplete,
      cost: metadata?.cost_usd,
      duration: metadata?.duration_ms
    })

    return NextResponse.json({
      success: true,
      commentary_id: saved.id,
      created_at: saved.created_at
    })

  } catch (error) {
    console.error("[commentary] Failed to save commentary:", error)
    return NextResponse.json(
      {
        error: "Failed to save commentary",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

// GET endpoint to fetch commentary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: "Missing proposal ID" },
        { status: 400 }
      )
    }

    const commentary = await getLatestCommentary(id)

    if (!commentary) {
      return NextResponse.json(
        { error: "No commentary found for this proposal" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      commentary,
      created_at: commentary.created_at
    })

  } catch (error) {
    console.error("[commentary] Failed to fetch commentary:", error)
    return NextResponse.json(
      { error: "Failed to fetch commentary" },
      { status: 500 }
    )
  }
}
