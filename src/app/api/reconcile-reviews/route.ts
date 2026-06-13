// Durable trigger for the verification-note poster. On a QStash schedule, finds proposals
// that have a canonical thread, are verified, and haven't been handled, and enqueues the
// (idempotent) review checker for each. This is the reliable backbone — it survives missed
// events and restarts; the opportunistic kick from detect-forum-post just lowers latency.
import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getProposalsAwaitingReview } from "@/lib/db";
import { getVerificationStatusForProposals } from "@/lib/github";
import { enqueueReviewCheck } from "@/lib/forum-detect";

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

  const candidates = await getProposalsAwaitingReview(25);
  if (candidates.length === 0) return NextResponse.json({ status: "idle", candidates: 0 });

  // Live verification status for the candidates; only enqueue the green ones.
  const statuses = await getVerificationStatusForProposals(candidates.map((c) => c.proposalId));
  const ready = candidates.filter((c) => statuses.get(c.proposalId)?.status === "verified");

  let i = 0;
  for (const c of ready) {
    await enqueueReviewCheck(c.proposalId, i * 15); // stagger to be gentle on the forum
    i++;
  }
  console.log(`[reconcile-reviews] candidates=${candidates.length} verified-ready=${ready.length} enqueued=${i}`);
  return NextResponse.json({ status: "ok", candidates: candidates.length, enqueued: i });
}
