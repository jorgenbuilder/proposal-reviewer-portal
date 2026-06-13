// The verification-note poster. Idempotent, self-gating: runs every gate and only posts a
// factual verification note to the canonical forum thread when the build verification is
// independently confirmed. Enqueued by the reconciler and opportunistically by
// detect-forum-post. Never posts on any doubt — flags + emails instead.
//
// Body: { proposalId: string }
import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getReviewPostState, markReviewPosted, markReviewFlagged, REVIEW_MIN_PROPOSAL_DATE } from "@/lib/db";
import { getVerificationStatusForProposals } from "@/lib/github";
import { auditProposalVerification } from "@/lib/verification-audit";
import { scheduleDetection } from "@/lib/forum-detect";
import { recordEvent } from "@/lib/events";
import {
  topicIdFromUrl,
  hasPostByUser,
  postReply,
  FORUM_POST_USERNAME,
  ForumAuthError,
  ForumRateLimitError,
  ForumDuplicateError,
} from "@/lib/forum";
import { renderVerificationNote } from "@/lib/review-template";
import { sendVerificationFlagEmail, sendForumCredentialAlertEmail } from "@/lib/email";

async function verifyQStash(signature: string | null, body: string): Promise<boolean> {
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
  const authHeader = request.headers.get("authorization");
  const ok = (await verifyQStash(signature, body)) ||
    (!!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let proposalId: string;
  let force = false;
  try {
    const parsed = JSON.parse(body || "{}");
    proposalId = String(parsed.proposalId);
    force = parsed.force === true; // manual single-proposal override (bypasses the date cutoff only)
    if (!proposalId || proposalId === "undefined") throw new Error("missing proposalId");
  } catch (e) {
    return NextResponse.json({ error: "bad body: " + (e as Error).message }, { status: 400 });
  }
  const log = (...a: unknown[]) => console.log(`[review] [${proposalId}]`, ...a);

  try {
    // Gate 1: not already handled
    const { state, canonicalForumUrl, proposalTimestamp } = await getReviewPostState(proposalId);
    if (state) { log("already", state); return NextResponse.json({ status: state }); }
    // Invariant: never act on proposals dated before the cutoff (no backlog).
    // `force` (manual, single proposal) bypasses ONLY this date gate — all other gates
    // (idempotency, verification-green, audit) still apply.
    if (!force && (!proposalTimestamp || new Date(proposalTimestamp) < new Date(REVIEW_MIN_PROPOSAL_DATE))) {
      log("before cutoff or no timestamp; skipping", proposalTimestamp);
      return NextResponse.json({ status: "before-cutoff" });
    }
    if (force) log("FORCE: bypassing date cutoff");
    if (!canonicalForumUrl) {
      // Verify-first ordering (e.g. the gh-verifier callback fired before the forum thread
      // exists). If verified, switch canonical detection into tight mode so we catch the post
      // ASAP; the detect loop will kick us back when it lands.
      const verified = (await getVerificationStatusForProposals([proposalId])).get(proposalId)?.status === "verified";
      if (verified) {
        await scheduleDetection(proposalId, 0, true).catch((e) => log("tight-detect kick warn:", (e as Error).message));
        log("no canonical yet; switched detection to tight mode");
      }
      return NextResponse.json({ status: "no-canonical", tightDetection: verified });
    }
    const topicId = topicIdFromUrl(canonicalForumUrl);
    if (!topicId) { log("bad canonical url", canonicalForumUrl); return NextResponse.json({ status: "bad-canonical-url" }); }

    // Gate 2: idempotency FIRST — if the posting user already replied in this topic (e.g. a
    // manual review), mark posted and stop. Cheaply resolves the backlog without auditing.
    if (await hasPostByUser(topicId, FORUM_POST_USERNAME)) {
      log("user already posted in topic; marking posted");
      await markReviewPosted(proposalId, canonicalForumUrl);
      return NextResponse.json({ status: "already-posted" });
    }

    // Gate 3: verification must be green (live). If not yet, no-op; the reconciler retries.
    const statuses = await getVerificationStatusForProposals([proposalId]);
    const vstatus = statuses.get(proposalId)?.status;
    if (vstatus !== "verified") { log("verification not green:", vstatus); return NextResponse.json({ status: "pending-verification", vstatus }); }
    await recordEvent(proposalId, "verification_verified", { once: true, push: { title: "Build verified", body: `#${proposalId} verification is green` } });

    // Gate 4: independent audit (false-positive guard)
    const audit = await auditProposalVerification(proposalId);
    if (audit.inconclusive) {
      // Can't confirm yet (e.g. run predates the result artifact). Skip silently; leave the
      // proposal unhandled so a later re-verification can resolve it. No flag, no email.
      log("inconclusive, leaving pending:", audit.inconclusiveReasons.join("; "));
      return NextResponse.json({ status: "inconclusive", reasons: audit.inconclusiveReasons });
    }
    if (!audit.ok) {
      log("AUDIT FLAGGED:", audit.reasons.join("; "));
      await markReviewFlagged(proposalId, audit.reasons.join("; "));
      await sendVerificationFlagEmail(proposalId, audit.reasons, audit.runUrl);
      await recordEvent(proposalId, "review_flagged", { detail: audit.reasons.join("; "), push: { title: "⚠️ Verification flagged", body: `#${proposalId}: ${audit.reasons[0] || "discrepancy"}` } });
      return NextResponse.json({ status: "flagged", reasons: audit.reasons });
    }

    // Post the factual verification note.
    const raw = renderVerificationNote({ proposalId, title: audit.title || "", verificationRunUrl: audit.runUrl || "" });
    const posted = await postReply(topicId, raw);
    await markReviewPosted(proposalId, posted.url);
    await recordEvent(proposalId, "review_posted", { detail: posted.url, push: { title: "Verification note posted", body: `#${proposalId} posted to the forum` } });
    log("✅ posted verification note:", posted.url);
    return NextResponse.json({ status: "posted", url: posted.url });
  } catch (err) {
    if (err instanceof ForumDuplicateError) {
      await markReviewPosted(proposalId, "(duplicate-detected)");
      return NextResponse.json({ status: "duplicate-marked-posted" });
    }
    if (err instanceof ForumRateLimitError) {
      // Don't mark; reconciler will retry on its next sweep.
      log("rate limited; will retry later");
      return NextResponse.json({ status: "rate-limited", waitSeconds: err.waitSeconds });
    }
    if (err instanceof ForumAuthError) {
      log("FORUM AUTH ERROR:", err.message);
      await sendForumCredentialAlertEmail(`${err.message} (posting review for proposal ${proposalId})`);
      return NextResponse.json({ status: "auth-error" });
    }
    log("error:", (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
