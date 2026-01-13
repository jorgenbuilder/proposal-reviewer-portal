'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Status = { type: 'success' | 'error'; message: string } | null

export default function CookiesAdminPage() {
  const [secret, setSecret] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [cookieText, setCookieText] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const [loading, setLoading] = useState(false)

  // Check for stored secret in sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('commentary_secret')
    if (stored) {
      setSecret(stored)
      setAuthenticated(true)
    }
  }, [])

  const handleAuth = () => {
    if (secret.length > 0) {
      sessionStorage.setItem('commentary_secret', secret)
      setAuthenticated(true)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('commentary_secret')
    setSecret('')
    setAuthenticated(false)
    setCookieText('')
    setStatus(null)
  }

  const handleSaveCookies = async () => {
    setLoading(true)
    setStatus(null)

    try {
      const response = await fetch('/api/forum-cookies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`
        },
        body: JSON.stringify({ cookieText })
      })

      const data = await response.json()

      if (response.ok) {
        setStatus({
          type: 'success',
          message: `Saved ${data.count} cookies successfully`
        })
        setCookieText('') // Clear input
      } else {
        setStatus({
          type: 'error',
          message: data.details || data.error || 'Failed to save cookies'
        })
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  const handleClearCookies = async () => {
    if (!confirm('Are you sure you want to clear all cookies?')) return

    setLoading(true)
    setStatus(null)

    try {
      const response = await fetch('/api/forum-cookies', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${secret}`
        }
      })

      if (response.ok) {
        setStatus({ type: 'success', message: 'Cookies cleared successfully' })
      } else {
        const data = await response.json()
        setStatus({
          type: 'error',
          message: data.details || data.error || 'Failed to clear cookies'
        })
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Authentication</CardTitle>
            <CardDescription>
              Enter COMMENTARY_SECRET to manage forum cookies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="secret">Secret</Label>
              <Input
                id="secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                placeholder="Enter COMMENTARY_SECRET"
              />
            </div>
            <Button onClick={handleAuth} className="w-full">
              Authenticate
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Forum Cookie Management</h1>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Update Forum Cookies</CardTitle>
            <CardDescription>
              Paste cookies in Netscape format or as raw Cookie header string
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cookies">Cookie Data</Label>
              <Textarea
                id="cookies"
                placeholder={`# Netscape HTTP Cookie File
forum.dfinity.org	TRUE	/	TRUE	1234567890	_t	abc123...

Or paste Cookie header:
_t=abc123...; _forum_session=xyz789...`}
                value={cookieText}
                onChange={(e) => setCookieText(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            {status && (
              <div
                className={`p-3 rounded ${
                  status.type === 'success'
                    ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-100'
                    : 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-100'
                }`}
              >
                {status.message}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleSaveCookies}
                disabled={loading || !cookieText}
              >
                {loading ? 'Saving...' : 'Save Cookies'}
              </Button>
              <Button
                variant="destructive"
                onClick={handleClearCookies}
                disabled={loading}
              >
                {loading ? 'Clearing...' : 'Clear All Cookies'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <h3>How to Export Cookies</h3>
            <ol>
              <li>Log into forum.dfinity.org in your browser</li>
              <li>Export cookies using one of the methods below</li>
              <li>Copy cookie data</li>
              <li>Paste into textarea above and click Save</li>
            </ol>

            <h4>Export Methods</h4>
            <ul>
              <li>
                <strong>Chrome/Edge:</strong> Use &quot;Get cookies.txt&quot;
                extension
              </li>
              <li>
                <strong>Firefox:</strong> Use &quot;cookies.txt&quot; extension
              </li>
              <li>
                <strong>Manual (DevTools):</strong>
                <ol>
                  <li>Press F12 to open DevTools</li>
                  <li>Go to Application &rarr; Cookies &rarr; forum.dfinity.org</li>
                  <li>Copy cookie names and values</li>
                  <li>
                    Format as: <code>name1=value1; name2=value2</code>
                  </li>
                </ol>
              </li>
            </ul>

            <h4>Security Notes</h4>
            <ul>
              <li>Cookies are encrypted at rest in the database (AES-256-GCM)</li>
              <li>Only accessible with COMMENTARY_SECRET</li>
              <li>Used by GitHub Actions to search forum discussions</li>
              <li>Cookies may expire - update here when needed</li>
            </ul>

            <h4>What Cookies Are Needed</h4>
            <p>
              The forum search script needs authentication cookies from
              forum.dfinity.org. Typically this includes:
            </p>
            <ul>
              <li>
                <code>_t</code> - Authentication token
              </li>
              <li>
                <code>_forum_session</code> - Session cookie
              </li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
