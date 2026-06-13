// Per-proposal canonical-forum-post detection, driven by self-rescheduling QStash tasks.
// Replaces the old cookie-based batch /api/detect-forum-posts.
//
// Body: { proposalId: string, attempt: number }
//  - already canonical  → done
//  - found              → save canonical thread, done
//  - not found yet      → reschedule next attempt (backoff), or stop when exhausted
//  - key rejected       → email alert, stop (don't burn attempts on a dead key)
import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { addForumThread, hasCanonicalForumThread } from "@/lib/db";
import { findCanonicalThread, ForumAuthError } from "@/lib/forum";
import { scheduleDetection, enqueueReviewCheck } from "@/lib/forum-detect";
import { sendForumCredentialAlertEmail } from "@/lib/email";

async function verifyQStashSignature(signature: string | null, body: string): Promise<boolean> {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next || !signature) return false;
  try {
    await new Receiver({ currentSigningKey: current, nextSigningKey: next }).verify({ signature, body });
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("upstash-signature");
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const authorized =
    (await verifyQStashSignature(signature, body)) ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let proposalId: string, attempt: number;
  try {
    const parsed = JSON.parse(body || "{}");
    proposalId = String(parsed.proposalId);
    attempt = Number(parsed.attempt ?? 0);
    if (!proposalId || proposalId === "undefined") throw new Error("missing proposalId");
  } catch (e) {
    return NextResponse.json({ error: "bad body: " + (e as Error).message }, { status: 400 });
  }
  const log = (...a: unknown[]) => console.log(`[detect-forum-post] [${proposalId}#${attempt}]`, ...a);

  // Already resolved (e.g. user added it, or a prior attempt won) → stop.
  if (await hasCanonicalForumThread(proposalId)) {
    log("already has canonical thread");
    return NextResponse.json({ status: "already-canonical" });
  }

  try {
    const thread = await findCanonicalThread(proposalId);
    if (thread) {
      await addForumThread(proposalId, thread.url, thread.title, true);
      log("found + saved canonical:", thread.url);
      // Opportunistic low-latency kick; the checker self-gates on verification + idempotency.
      await enqueueReviewCheck(proposalId).catch((e) => log("review enqueue warn:", (e as Error).message));
      return NextResponse.json({ status: "found", url: thread.url });
    }
    const more = await scheduleDetection(proposalId, attempt + 1);
    log(more ? `not found; rescheduled attempt ${attempt + 1}` : "not found; attempts exhausted");
    return NextResponse.json({ status: more ? "rescheduled" : "exhausted" });
  } catch (err) {
    if (err instanceof ForumAuthError) {
      // Dead/invalid key: alert and stop — do NOT reschedule (would just fail again).
      log("FORUM AUTH ERROR:", err.message);
      await sendForumCredentialAlertEmail(`${err.message} (proposal ${proposalId}, attempt ${attempt})`);
      return NextResponse.json({ status: "auth-error" });
    }
    // Transient (network / forum 5xx): 500 lets QStash retry delivery.
    log("transient error:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
