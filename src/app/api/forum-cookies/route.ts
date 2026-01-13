import { NextRequest, NextResponse } from 'next/server'
import { saveForumCookies, getForumCookies, clearForumCookies } from '@/lib/db'

/**
 * Verify COMMENTARY_SECRET for authentication
 * Used for both admin UI and GitHub Action access
 */
function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const commentarySecret = process.env.COMMENTARY_SECRET

  if (!commentarySecret) {
    console.error('[forum-cookies] COMMENTARY_SECRET not configured')
    return false
  }

  return authHeader === `Bearer ${commentarySecret}`
}

/**
 * GET: Retrieve cookies for GitHub Action
 * Auth: COMMENTARY_SECRET
 * Returns raw cookie text for Claude Code to handle
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuth(request)) {
      console.warn('[forum-cookies] Unauthorized GET attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cookieText = await getForumCookies()

    if (!cookieText) {
      return NextResponse.json(
        { error: 'No cookies configured' },
        { status: 404 }
      )
    }

    // Return raw cookie text - Claude Code will handle parsing
    return NextResponse.json({
      cookies: cookieText
    })
  } catch (error) {
    console.error('[forum-cookies] Failed to retrieve cookies:', error)
    return NextResponse.json(
      {
        error: 'Failed to retrieve cookies',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * POST: Update cookies from admin UI
 * Auth: COMMENTARY_SECRET
 * Body: { cookieText: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuth(request)) {
      console.warn('[forum-cookies] Unauthorized POST attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { cookieText } = body

    if (!cookieText || typeof cookieText !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid cookieText field' },
        { status: 400 }
      )
    }

    if (cookieText.trim().length === 0) {
      return NextResponse.json(
        { error: 'Cookie text cannot be empty' },
        { status: 400 }
      )
    }

    // Save raw cookie text to database (encrypted)
    await saveForumCookies(cookieText, 'admin')

    console.log(`[forum-cookies] Updated cookies (${cookieText.length} characters)`)

    // Return success
    return NextResponse.json({
      success: true,
      length: cookieText.length
    })
  } catch (error) {
    console.error('[forum-cookies] Failed to save cookies:', error)
    return NextResponse.json(
      {
        error: 'Failed to save cookies',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE: Clear all cookies
 * Auth: COMMENTARY_SECRET
 */
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuth(request)) {
      console.warn('[forum-cookies] Unauthorized DELETE attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await clearForumCookies()

    console.log('[forum-cookies] Cleared all cookies')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[forum-cookies] Failed to clear cookies:', error)
    return NextResponse.json(
      {
        error: 'Failed to clear cookies',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
