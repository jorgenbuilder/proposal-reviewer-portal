import { NextRequest, NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getRecentProposals } from "@/lib/db";
import { getVerificationRunForProposal } from "@/lib/github";
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

// Trigger GitHub Actions workflow
async function triggerWorkflow(
  workflowId: string,
  proposalId: string
): Promise<boolean> {
  if (!GITHUB_TOKEN) {
    console.error("GITHUB_TOKEN not configured");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowId}/dispatches`,
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
        `Failed to trigger ${workflowId} for proposal ${proposalId}:`,
        response.status,
        errorText
      );
      return false;
    }

    console.log(`Triggered ${workflowId} for proposal ${proposalId}`);
    return true;
  } catch (error) {
    console.error(`Error triggering ${workflowId} for proposal ${proposalId}:`, error);
    return false;
  }
}

// Trigger both verify and commentary workflows
async function triggerVerificationWorkflows(proposalId: string): Promise<{
  verify: boolean;
  commentary: boolean;
}> {
  const [verifySuccess, commentarySuccess] = await Promise.all([
    triggerWorkflow("verify.yml", proposalId),
    triggerWorkflow("commentary.yml", proposalId),
  ]);

  return {
    verify: verifySuccess,
    commentary: commentarySuccess,
  };
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
    const skippedProposals: string[] = [];
    const failedWorkflows: { proposalId: string; reason: string }[] = [];

    for (const proposal of proposals) {
      const proposalIdBigInt = BigInt(proposal.proposal_id);

      // Skip if below minimum proposal ID
      if (proposalIdBigInt < MIN_PROPOSAL_ID) {
        skippedProposals.push(proposal.proposal_id);
        continue;
      }

      // Check if this proposal is an upgrade proposal (needs verification)
      const proposalDetail = await getProposal(proposalIdBigInt);

      if (!proposalDetail) {
        skippedProposals.push(proposal.proposal_id);
        continue;
      }

      const isUpgradeProposal = !!(
        proposalDetail.expectedWasmHash || proposalDetail.canisterId
      );

      if (!isUpgradeProposal) {
        skippedProposals.push(proposal.proposal_id);
        continue;
      }

      // Check if verification already exists
      const existingRun = await getVerificationRunForProposal(
        proposal.proposal_id
      );

      if (existingRun) {
        skippedProposals.push(proposal.proposal_id);
        continue;
      }

      // Trigger both verify and commentary workflows
      const result = await triggerVerificationWorkflows(proposal.proposal_id);

      if (result.verify || result.commentary) {
        triggeredProposals.push(proposal.proposal_id);
        if (!result.verify) {
          failedWorkflows.push({
            proposalId: proposal.proposal_id,
            reason: "verify workflow failed to trigger",
          });
        }
        if (!result.commentary) {
          failedWorkflows.push({
            proposalId: proposal.proposal_id,
            reason: "commentary workflow failed to trigger",
          });
        }
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return NextResponse.json({
      success: true,
      triggered: triggeredProposals,
      skipped: skippedProposals,
      failedWorkflows: failedWorkflows.length > 0 ? failedWorkflows : undefined,
      message: `Triggered workflows for ${triggeredProposals.length} proposals`,
    });
  } catch (error) {
    console.error("Error in trigger-verification:", error);
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

  // Reuse POST logic
  return POST(request);
}
