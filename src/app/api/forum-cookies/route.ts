import { NextRequest, NextResponse } from 'next/server'
import { parseCookies, cookiesToHeaderString, validateCookies } from '@/lib/cookie-parser'
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
 * Returns cookies as both header string and parsed format
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    if (!verifyAuth(request)) {
      console.warn('[forum-cookies] Unauthorized GET attempt')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const cookies = await getForumCookies()

    if (!cookies) {
      return NextResponse.json(
        { error: 'No cookies configured' },
        { status: 404 }
      )
    }

    // Return as Cookie header string for easy use
    const cookieHeader = cookiesToHeaderString(cookies)

    return NextResponse.json({
      cookies: cookieHeader,
      parsed: cookies, // Also include parsed format
      count: cookies.length
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

    // Parse cookies
    let parsed
    try {
      parsed = parseCookies(cookieText)
      validateCookies(parsed)
    } catch (err) {
      return NextResponse.json(
        {
          error: 'Failed to parse cookies',
          details: err instanceof Error ? err.message : 'Invalid format'
        },
        { status: 400 }
      )
    }

    // Save to database
    await saveForumCookies(parsed, 'admin')

    console.log(`[forum-cookies] Updated ${parsed.length} cookies`)

    // Return success with masked cookie info (don't return values)
    return NextResponse.json({
      success: true,
      count: parsed.length,
      cookies: parsed.map((c) => ({
        name: c.name,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        secure: c.secure
      }))
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
