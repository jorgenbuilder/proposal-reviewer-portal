import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getRecentProposals, getCommentaryCount } from "@/lib/db";
import { hasRecentCommentaryRun } from "@/lib/github";
import { getProposal, MIN_PROPOSAL_ID } from "@/lib/nns";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "jorgenbuilder";
const REPO_NAME = "icp-build-verifier";

// Verify QStash signature
async function verifyQStashSignature(
  signature: string | null,
  body: string
): Promise<boolean> {
  const qstashCurrentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const qstashNextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!qstashCurrentSigningKey || !qstashNextSigningKey) {
    console.warn("QStash signing keys not configured");
    return false;
  }

  if (!signature) {
    return false;
  }

  const receiver = new Receiver({
    currentSigningKey: qstashCurrentSigningKey,
    nextSigningKey: qstashNextSigningKey,
  });

  try {
    await receiver.verify({
      signature,
      body,
    });
    return true;
  } catch {
    return false;
  }
}

// Trigger commentary GitHub Actions workflow
async function triggerCommentaryWorkflow(proposalId: string): Promise<boolean> {
  if (!GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/commentary.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: "main",
          inputs: {
            proposal_id: proposalId,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Failed to trigger commentary for proposal ${proposalId}:`,
        response.status,
        errorText
      );
      return false;
    }

    console.log(`Triggered commentary workflow for proposal ${proposalId}`);
    return true;
  } catch (error) {
    console.error(
      `Error triggering commentary for proposal ${proposalId}:`,
      error
    );
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Verify QStash signature or check for cron secret
  const authHeader = request.headers.get("authorization");
  const signature = request.headers.get("upstash-signature");
  const body = await request.text();
  const cronSecret = process.env.CRON_SECRET;
  const isAuthorizedCron =
    cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isQStashRequest = await verifyQStashSignature(signature, body);

  if (!isAuthorizedCron && !isQStashRequest) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get recent proposals
    const proposals = await getRecentProposals(20);
    const triggeredProposals: string[] = [];
    const skippedProposals: { proposalId: string; reason: string }[] = [];
    const failedProposals: { proposalId: string; reason: string }[] = [];

    for (const proposal of proposals) {
      const proposalIdBigInt = BigInt(proposal.proposal_id);

      // Skip if below minimum proposal ID
      if (proposalIdBigInt < MIN_PROPOSAL_ID) {
        skippedProposals.push({
          proposalId: proposal.proposal_id,
          reason: "below minimum proposal ID",
        });
        continue;
      }

      // Check if this proposal is an upgrade proposal (needs commentary)
      const proposalDetail = await getProposal(proposalIdBigInt);

      if (!proposalDetail) {
        skippedProposals.push({
          proposalId: proposal.proposal_id,
          reason: "could not fetch proposal details",
        });
        continue;
      }

      const isUpgradeProposal = !!(
        proposalDetail.expectedWasmHash || proposalDetail.canisterId
      );

      if (!isUpgradeProposal) {
        skippedProposals.push({
          proposalId: proposal.proposal_id,
          reason: "not an upgrade proposal",
        });
        continue;
      }

      // Check if commentary already exists in database
      const commentaryCount = await getCommentaryCount(proposal.proposal_id);
      if (commentaryCount > 0) {
        skippedProposals.push({
          proposalId: proposal.proposal_id,
          reason: "commentary already exists",
        });
        continue;
      }

      // Check if commentary workflow was triggered recently (within last 30 minutes)
      // Use longer window than verification since commentary takes longer
      const hasRecentRun = await hasRecentCommentaryRun(
        proposal.proposal_id,
        30
      );

      if (hasRecentRun) {
        skippedProposals.push({
          proposalId: proposal.proposal_id,
          reason: "recent commentary run exists",
        });
        continue;
      }

      // Trigger commentary workflow
      const success = await triggerCommentaryWorkflow(proposal.proposal_id);

      if (success) {
        triggeredProposals.push(proposal.proposal_id);
      } else {
        failedProposals.push({
          proposalId: proposal.proposal_id,
          reason: "failed to trigger workflow",
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return NextResponse.json({
      success: true,
      triggered: triggeredProposals,
      skipped: skippedProposals,
      failed: failedProposals.length > 0 ? failedProposals : undefined,
      message: `Triggered commentary for ${triggeredProposals.length} proposals`,
    });
  } catch (error) {
    console.error("Error in trigger-commentary:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for manual testing
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Create a mock request with the same headers
  const mockRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
  });

  return POST(mockRequest);
}
