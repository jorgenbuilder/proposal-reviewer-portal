const REPO_OWNER = "jorgenbuilder";
const REPO_NAME = "icp-build-verifier";

export interface ActionRun {
  id: number;
  displayTitle: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
  htmlUrl: string;
  createdAt: string;
}

export async function getVerificationRunForProposal(
  proposalId: string
): Promise<ActionRun | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=100`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          // Add token if rate limited: Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
        },
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) {
      console.error("GitHub API error:", response.status);
      return null;
    }

    const data = await response.json();

    // Find run matching proposal ID
    const run = data.workflow_runs?.find((r: { display_title?: string }) =>
      r.display_title?.includes(`Verify Proposal #${proposalId}`)
    );

    if (!run) {
      return null;
    }

    return {
      id: run.id,
      displayTitle: run.display_title,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.html_url,
      createdAt: run.created_at,
    };
  } catch (error) {
    console.error("Failed to fetch GitHub actions:", error);
    return null;
  }
}

export function getVerificationRunUrl(runId: number): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}`;
}

export function getDashboardUrl(proposalId: string): string {
  return `https://dashboard.internetcomputer.org/proposal/${proposalId}`;
}

export type VerificationStatus =
  | "verified"
  | "failed"
  | "in_progress"
  | "pending";

export interface VerificationInfo {
  status: VerificationStatus;
  runUrl: string | null;
}

export async function getVerificationStatusForProposals(
  proposalIds: string[]
): Promise<Map<string, VerificationInfo>> {
  const result = new Map<string, VerificationInfo>();

  // Initialize all as pending
  for (const id of proposalIds) {
    result.set(id, { status: "pending", runUrl: null });
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=100`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
        next: { revalidate: 60 },
      }
    );

    if (!response.ok) {
      return result;
    }

    const data = await response.json();
    const runs = data.workflow_runs || [];

    // Match runs to proposal IDs
    for (const run of runs) {
      const match = run.display_title?.match(/Verify Proposal #(\d+)/);
      if (match) {
        const proposalId = match[1];
        if (proposalIds.includes(proposalId)) {
          let status: VerificationStatus = "pending";
          if (run.status !== "completed") {
            status = "in_progress";
          } else {
            status = run.conclusion === "success" ? "verified" : "failed";
          }
          result.set(proposalId, { status, runUrl: run.html_url });
        }
      }
    }
  } catch (error) {
    console.error("Failed to fetch GitHub actions:", error);
  }

  return result;
}
