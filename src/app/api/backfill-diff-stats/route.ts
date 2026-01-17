import { NextResponse } from "next/server";
import {
  getProposalsNeedingDiffStats,
  updateProposalDiffStats,
} from "@/lib/db";
import {
  getCommitDiffStats,
  getCommitDiffStatsByHash,
  parseGitHubUrl,
  getDiffStatsFromCommits,
} from "@/lib/github";
import { getProposal } from "@/lib/nns";

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
    const forceRefresh = url.searchParams.get("force") === "true";

    console.log(`[backfill-diff-stats] Starting backfill with batch size ${batchSize}, force=${forceRefresh}...`);

    // Get proposals that need diff stats
    const proposals = await getProposalsNeedingDiffStats(batchSize, forceRefresh);
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
        let source = "";

        // Fetch full proposal details from NNS to get summary with PR links
        const proposalDetails = await getProposal(BigInt(proposal.proposalId));
        const proposalText = proposalDetails
          ? `${proposalDetails.title}\n${proposalDetails.summary}\n${proposalDetails.url}`
          : `${proposal.proposalUrl || ""}`;

        // First try: Extract commits listed in proposal body and sum their diffs
        diffStats = await getDiffStatsFromCommits(proposalText);
        if (diffStats) {
          source = "commits";
        }

        // Second try: Get stats from proposal URL (includes path filtering)
        if (!diffStats && proposal.proposalUrl?.includes("github.com")) {
          diffStats = await getCommitDiffStats(proposal.proposalUrl);
          if (diffStats) {
            const parsed = parseGitHubUrl(proposal.proposalUrl);
            source = parsed?.path ? `commit (${parsed.path})` : "commit";
          }
        }

        // Third try: Search by commit hash
        if (!diffStats && proposal.commitHash) {
          let pathFilter: string | null = null;
          if (proposal.proposalUrl) {
            const parsed = parseGitHubUrl(proposal.proposalUrl);
            pathFilter = parsed?.path || null;
          }
          diffStats = await getCommitDiffStatsByHash(proposal.commitHash, pathFilter || undefined);
          if (diffStats) {
            source = pathFilter ? `hash (${pathFilter})` : "hash";
          }
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
            `[backfill-diff-stats] #${proposal.proposalId}: +${diffStats.additions} -${diffStats.deletions} (from ${source})`
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
