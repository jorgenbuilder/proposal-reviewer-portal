import { NextResponse } from "next/server";
import {
  getProposalsNeedingDiffStats,
  updateProposalDiffStats,
} from "@/lib/db";
import {
  getCommitDiffStats,
  getCommitDiffStatsByHash,
} from "@/lib/github";

// Verify cron secret or QStash signature
function verifyAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Check Bearer token
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Check Upstash QStash signature
  const upstashSignature = request.headers.get("upstash-signature");
  if (upstashSignature) {
    return true;
  }

  // Allow Vercel Cron
  const vercelCron = request.headers.get("x-vercel-cron");
  if (vercelCron) {
    return true;
  }

  return false;
}

export async function POST(request: Request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get batch size from query params, default to 20 to avoid rate limits
    const url = new URL(request.url);
    const batchSize = Math.min(
      parseInt(url.searchParams.get("batch") || "20", 10),
      100
    );

    console.log(`[backfill-diff-stats] Starting backfill with batch size ${batchSize}...`);

    // Get proposals that need diff stats
    const proposals = await getProposalsNeedingDiffStats(batchSize);
    console.log(`[backfill-diff-stats] Found ${proposals.length} proposals needing diff stats`);

    if (proposals.length === 0) {
      return NextResponse.json({
        message: "No proposals need backfilling",
        processed: 0,
        success: 0,
        failed: 0,
      });
    }

    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      details: [] as Array<{
        proposalId: string;
        status: "success" | "failed" | "no_data";
        linesAdded?: number;
        linesRemoved?: number;
        error?: string;
      }>,
    };

    // Process each proposal with a small delay to avoid rate limits
    for (const proposal of proposals) {
      results.processed++;

      try {
        let diffStats = null;

        // Try to get stats from proposal URL first
        if (proposal.proposalUrl?.includes("github.com")) {
          diffStats = await getCommitDiffStats(proposal.proposalUrl);
        }

        // Fall back to searching by commit hash
        if (!diffStats && proposal.commitHash) {
          diffStats = await getCommitDiffStatsByHash(proposal.commitHash);
        }

        if (diffStats) {
          await updateProposalDiffStats(
            proposal.proposalId,
            diffStats.additions,
            diffStats.deletions
          );
          results.success++;
          results.details.push({
            proposalId: proposal.proposalId,
            status: "success",
            linesAdded: diffStats.additions,
            linesRemoved: diffStats.deletions,
          });
          console.log(
            `[backfill-diff-stats] #${proposal.proposalId}: +${diffStats.additions} -${diffStats.deletions}`
          );
        } else {
          // Mark as 0/0 to indicate we tried but found no data
          // This prevents retrying proposals that genuinely have no GitHub data
          await updateProposalDiffStats(proposal.proposalId, 0, 0);
          results.details.push({
            proposalId: proposal.proposalId,
            status: "no_data",
          });
          console.log(
            `[backfill-diff-stats] #${proposal.proposalId}: no GitHub data found`
          );
        }

        // Small delay to avoid hitting GitHub rate limits (5000/hour with auth)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        results.failed++;
        results.details.push({
          proposalId: proposal.proposalId,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
        console.error(
          `[backfill-diff-stats] #${proposal.proposalId} failed:`,
          error
        );
      }
    }

    console.log("[backfill-diff-stats] Complete:", {
      processed: results.processed,
      success: results.success,
      failed: results.failed,
    });

    return NextResponse.json({
      message: "Backfill complete",
      ...results,
    });
  } catch (error) {
    console.error("[backfill-diff-stats] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing / Vercel Cron
export async function GET(request: Request) {
  return POST(request);
}
