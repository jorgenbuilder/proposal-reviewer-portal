// Pipeline event recording: append to the proposal_events log and (optionally) push a
// notification to the operator. One call per lifecycle milestone keeps call sites tidy.
//
// Operator push reuses the portal's existing web-push infra, but targets only the
// operator's subscriptions (by email) so pipeline/ops events don't spam public subscribers.
import { logProposalEvent, hasProposalEvent, getSubscriptions } from "./db";
import { sendPushNotification, PushPayload } from "./web-push-server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://proposal-reviewer-portal.vercel.app";

// Push pipeline/ops events to every push subscription (single-operator app — no email gate).
// Best-effort, never throws.
export async function notifyOperator(payload: PushPayload): Promise<void> {
  try {
    const subs = await getSubscriptions();
    await Promise.all(
      subs.map((s) =>
        sendPushNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload).catch(() => false)
      )
    );
  } catch (e) {
    console.error("[events] notifyOperator failed:", (e as Error).message);
  }
}

export interface RecordEventOpts {
  detail?: string;
  once?: boolean; // skip if an event of this type already exists for the proposal
  push?: { title: string; body: string }; // if set, also push to the operator
}

/**
 * Record a pipeline milestone: append to proposal_events and optionally push to the
 * operator. Best-effort — logging/push failures never break the calling pipeline.
 * Returns false if skipped due to `once`.
 */
export async function recordEvent(proposalId: string, eventType: string, opts: RecordEventOpts = {}): Promise<boolean> {
  try {
    if (opts.once && (await hasProposalEvent(proposalId, eventType))) return false;
    await logProposalEvent(proposalId, eventType, opts.detail);
  } catch (e) {
    console.error(`[events] log failed (${eventType} #${proposalId}):`, (e as Error).message);
  }
  if (opts.push) {
    await notifyOperator({
      title: opts.push.title,
      body: opts.push.body,
      proposalId,
      url: `${APP_URL}/proposals/${proposalId}`,
    });
  }
  return true;
}
