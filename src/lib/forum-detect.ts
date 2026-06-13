// Schedules canonical-forum-post detection as self-rescheduling QStash tasks.
//
// On proposal creation we enqueue attempt 0; each attempt that doesn't find the thread
// reschedules the next with an exponential-ish backoff, until found or attempts exhausted.
// QStash delivers to /api/detect-forum-post.
import { Client } from "@upstash/qstash";

// Delay (seconds) before each attempt index. ~1m → 24h, spanning ~3 days total.
export const DETECT_BACKOFF_SECONDS = [
  60, 300, 900, 1800, 3600, 7200, 14400, 28800, 43200, 86400, 86400, 86400,
];
export const MAX_DETECT_ATTEMPTS = DETECT_BACKOFF_SECONDS.length;

function appUrl(): string {
  const u =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!u) throw new Error("NEXT_PUBLIC_APP_URL / VERCEL_URL not set");
  return u.replace(/\/+$/, "");
}

let _client: Client | null = null;
function client(): Client {
  if (!_client) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) throw new Error("QSTASH_TOKEN not set");
    _client = new Client({ token });
  }
  return _client;
}

/**
 * Schedule detection attempt `attempt` (0-based) for a proposal via QStash.
 * Returns false (without enqueueing) when attempts are exhausted.
 */
export async function scheduleDetection(proposalId: string, attempt: number): Promise<boolean> {
  if (attempt >= MAX_DETECT_ATTEMPTS) return false;
  await client().publishJSON({
    url: `${appUrl()}/api/detect-forum-post`,
    body: { proposalId, attempt },
    delay: DETECT_BACKOFF_SECONDS[attempt],
  });
  return true;
}
