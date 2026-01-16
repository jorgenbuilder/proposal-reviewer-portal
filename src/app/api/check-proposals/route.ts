import { NextResponse } from "next/server";
import {
  listProposals,
  filterNewProposals,
  extractCommitHash,
  PROPOSAL_TOPICS,
  TOPIC_NAMES,
  MIN_PROPOSAL_ID,
} from "@/lib/nns";
import {
  getSubscriptions,
  getSeenProposalIds,
  markProposalSeen,
  markProposalNotified,
  deleteSubscription,
  updateSubscriptionSuccess,
  logNotification,
  updateProposalDiffStats,
} from "@/lib/db";
import { sendPushNotification } from "@/lib/web-push-server";
import { sendProposalNotificationEmail } from "@/lib/email";
import { getCommitDiffStats, getCommitDiffStatsByHash, parseGitHubUrl, getDiffStatsFromPRs } from "@/lib/github";

// Verify cron secret or QStash signature
function verifyAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Check Bearer token
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Check Upstash QStash signature (simplified - in production use their SDK)
  const upstashSignature = request.headers.get("upstash-signature");
  if (upstashSignature) {
    // QStash requests are trusted if signature header present
    // For full verification, use @upstash/qstash Receiver
    return true;
  }

  // Allow Vercel Cron (check for Vercel-specific header)
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron) {
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  // Verify authorization
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[check-proposals] Starting proposal check...");

    // 1. Fetch recent proposals from NNS
    const proposals = await listProposals(100);
    console.log(`[check-proposals] Fetched ${proposals.length} proposals from NNS`);

    // 2. Get already seen proposals
    const seenIds = await getSeenProposalIds();
    console.log(`[check-proposals] ${seenIds.size} proposals already seen`);

    // 3. Get all unique topics from all subscriptions
    const subscriptions = await getSubscriptions();
    const allTopics = new Set<number>();
    for (const sub of subscriptions) {
      if (sub.topics && Array.isArray(sub.topics)) {
        sub.topics.forEach(topic => allTopics.add(topic));
      }
    }

    // If no topics configured, default to all topics
    const trackedTopics = allTopics.size > 0 ? Array.from(allTopics) : Object.values(PROPOSAL_TOPICS);
    console.log(`[check-proposals] Tracking topics: ${trackedTopics.join(', ')}`);

    // 4. Filter to new proposals in tracked topics
    const newProposals = filterNewProposals(
      proposals,
      trackedTopics,
      seenIds,
      MIN_PROPOSAL_ID
    );

    console.log(`[check-proposals] Found ${newProposals.length} new proposals`);

    if (newProposals.length === 0) {
      return NextResponse.json({
        message: "No new proposals",
        checked: proposals.length,
        seenCount: seenIds.size,
      });
    }

    console.log(`[check-proposals] ${subscriptions.length} subscriptions to notify`);

    // 5. Process each new proposal
    const results = {
      proposals: newProposals.length,
      notifications: { sent: 0, failed: 0 },
      emails: { sent: 0, failed: 0 },
    };

    for (const proposal of newProposals) {
      const proposalIdStr = proposal.id.toString();

      // Extract commit hash from proposal text
      const combinedText = `${proposal.title}\n${proposal.summary}\n${proposal.url}`;
      const commitHash = extractCommitHash(combinedText);

      // Convert timestamp to Date
      const proposalTimestamp = new Date(Number(proposal.proposalTimestampSeconds) * 1000);

      // Get topic name
      const topicName = TOPIC_NAMES[proposal.topic] || `Topic ${proposal.topic}`;

      // Mark as seen with commit hash, URL, and on-chain timestamp
      await markProposalSeen(
        proposalIdStr,
        topicName,
        proposal.title,
        commitHash,
        proposal.url || null,
        proposalTimestamp
      );

      // Fetch and store diff stats from GitHub (async, don't block notifications)
      const proposalText = `${proposal.title}\n${proposal.summary}\n${proposal.url}`;
      if (commitHash || proposal.url?.includes("github.com") || proposalText.includes("github.com")) {
        (async () => {
          try {
            let diffStats = null;
            let source = "";

            // First try: Extract PRs from proposal text and sum their diffs
            diffStats = await getDiffStatsFromPRs(proposalText);
            if (diffStats) {
              source = "PRs";
            }

            // Second try: Get stats from proposal URL (includes path filtering)
            if (!diffStats && proposal.url?.includes("github.com")) {
              diffStats = await getCommitDiffStats(proposal.url);
              if (diffStats) {
                const parsed = parseGitHubUrl(proposal.url);
                source = parsed?.path ? `commit (${parsed.path})` : "commit";
              }
            }

            // Third try: Search by commit hash
            if (!diffStats && commitHash) {
              let pathFilter: string | null = null;
              if (proposal.url) {
                const parsed = parseGitHubUrl(proposal.url);
                pathFilter = parsed?.path || null;
              }
              diffStats = await getCommitDiffStatsByHash(commitHash, pathFilter || undefined);
              if (diffStats) {
                source = pathFilter ? `hash (${pathFilter})` : "hash";
              }
            }

            if (diffStats) {
              await updateProposalDiffStats(
                proposalIdStr,
                diffStats.additions,
                diffStats.deletions
              );
              console.log(`[check-proposals] Stored diff stats for #${proposalIdStr}: +${diffStats.additions} -${diffStats.deletions} (from ${source})`);
            }
          } catch (error) {
            console.error(`[check-proposals] Failed to fetch diff stats for #${proposalIdStr}:`, error);
          }
        })();
      }

      // Notify subscribers who are interested in this topic
      for (const sub of subscriptions) {
        // Check if subscriber wants notifications for this topic
        const wantsNotification = sub.topics && Array.isArray(sub.topics)
          ? sub.topics.includes(proposal.topic)
          : true; // If no topics configured, notify for all

        if (!wantsNotification) {
          continue; // Skip this subscriber for this proposal
        }
        // Try push notification first
        try {
          const success = await sendPushNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            {
              title: "New Proposal",
              body: `#${proposalIdStr}: ${proposal.title}`,
              proposalId: proposalIdStr,
              url: `/proposals/${proposalIdStr}`,
            }
          );

          if (success) {
            results.notifications.sent++;
            await updateSubscriptionSuccess(sub.endpoint);
            await logNotification(proposalIdStr, sub.id, "push", "sent");
          } else {
            throw new Error("Push failed");
          }
        } catch (error) {
          results.notifications.failed++;

          // Check if subscription expired
          if (error instanceof Error && error.message === "SUBSCRIPTION_EXPIRED") {
            await deleteSubscription(sub.endpoint);
            await logNotification(proposalIdStr, sub.id, "push", "failed", "expired");
          } else {
            await logNotification(
              proposalIdStr,
              sub.id,
              "push",
              "failed",
              error instanceof Error ? error.message : "unknown"
            );
          }

          // Try email fallback if available
          if (sub.email) {
            const baseUrl = process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : "http://localhost:3000";

            const emailSent = await sendProposalNotificationEmail(sub.email, {
              proposalId: proposalIdStr,
              title: proposal.title,
              topic: topicName,
              dashboardUrl: `https://dashboard.internetcomputer.org/proposal/${proposalIdStr}`,
              appUrl: `${baseUrl}/proposals/${proposalIdStr}`,
            });

            if (emailSent) {
              results.emails.sent++;
              await logNotification(proposalIdStr, sub.id, "email", "sent");
            } else {
              results.emails.failed++;
              await logNotification(proposalIdStr, sub.id, "email", "failed");
            }
          }
        }
      }

      await markProposalNotified(proposalIdStr);
    }

    console.log("[check-proposals] Complete:", results);

    return NextResponse.json({
      message: "Processed",
      ...results,
    });
  } catch (error) {
    console.error("[check-proposals] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for Vercel Cron
export async function GET(request: Request) {
  return POST(request);
}
