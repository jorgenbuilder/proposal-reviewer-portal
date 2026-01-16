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
  proposalId: string,
  useAuth = false
): Promise<ActionRun | null> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    // Add auth token if requested (bypasses cache, gets fresh data)
    if (useAuth && process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const fetchOptions: RequestInit = {
      headers,
    };

    // Only cache if not using auth
    if (!useAuth) {
      fetchOptions.next = { revalidate: 60 };
    } else {
      // Disable cache when using auth
      fetchOptions.cache = "no-store";
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=100`,
      fetchOptions
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

// Check if there's a successful verification run for this proposal (any time, not just recent)
// Returns true if a successful verify workflow exists
export async function hasSuccessfulVerification(
  proposalId: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    // Always use auth for fresh data in cron checks
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=100`,
      {
        headers,
        cache: "no-store", // Always get fresh data
      }
    );

    if (!response.ok) {
      console.error("GitHub API error:", response.status);
      return false;
    }

    const data = await response.json();

    // Find any successful verify workflow for this proposal
    const successfulRun = data.workflow_runs?.find((r: {
      display_title?: string;
      status?: string;
      conclusion?: string;
    }) => {
      const matchesProposal =
        r.display_title?.includes(`Verify Proposal #${proposalId}`);
      const isCompleted = r.status === "completed";
      const isSuccess = r.conclusion === "success";

      return matchesProposal && isCompleted && isSuccess;
    });

    return !!successfulRun;
  } catch (error) {
    console.error("Failed to check for successful verification:", error);
    return false;
  }
}

// Check if ANY workflow (verify or commentary) exists for this proposal
// Returns true if a run exists within the last `withinMinutes` minutes
export async function hasRecentWorkflowRun(
  proposalId: string,
  withinMinutes = 10
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    // Always use auth for fresh data in cron checks
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=100`,
      {
        headers,
        cache: "no-store", // Always get fresh data
      }
    );

    if (!response.ok) {
      console.error("GitHub API error:", response.status);
      return false;
    }

    const data = await response.json();
    const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000);

    // Find ANY run (verify OR commentary) for this proposal created recently
    const recentRun = data.workflow_runs?.find((r: {
      display_title?: string;
      created_at?: string;
    }) => {
      const matchesProposal =
        r.display_title?.includes(`Proposal #${proposalId}`);
      const createdAt = r.created_at ? new Date(r.created_at) : null;
      const isRecent = createdAt && createdAt > cutoffTime;

      return matchesProposal && isRecent;
    });

    return !!recentRun;
  } catch (error) {
    console.error("Failed to check for recent workflow runs:", error);
    return false;
  }
}

export function getVerificationRunUrl(runId: number): string {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}`;
}

export function getDashboardUrl(proposalId: string): string {
  return `https://dashboard.internetcomputer.org/proposal/${proposalId}`;
}

// Check if there's a successful commentary run for this proposal
export async function hasSuccessfulCommentary(
  proposalId: string
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=100`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("GitHub API error:", response.status);
      return false;
    }

    const data = await response.json();

    // Find any successful commentary workflow for this proposal
    const successfulRun = data.workflow_runs?.find((r: {
      display_title?: string;
      status?: string;
      conclusion?: string;
    }) => {
      const matchesProposal =
        r.display_title?.includes(`Commentary for Proposal #${proposalId}`);
      const isCompleted = r.status === "completed";
      const isSuccess = r.conclusion === "success";

      return matchesProposal && isCompleted && isSuccess;
    });

    return !!successfulRun;
  } catch (error) {
    console.error("Failed to check for successful commentary:", error);
    return false;
  }
}

// Check if there's a recent commentary workflow run for this proposal
export async function hasRecentCommentaryRun(
  proposalId: string,
  withinMinutes = 10
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs?per_page=100`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error("GitHub API error:", response.status);
      return false;
    }

    const data = await response.json();
    const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000);

    // Find any commentary run for this proposal created recently
    const recentRun = data.workflow_runs?.find((r: {
      display_title?: string;
      created_at?: string;
    }) => {
      const matchesProposal =
        r.display_title?.includes(`Commentary for Proposal #${proposalId}`);
      const createdAt = r.created_at ? new Date(r.created_at) : null;
      const isRecent = createdAt && createdAt > cutoffTime;

      return matchesProposal && isRecent;
    });

    return !!recentRun;
  } catch (error) {
    console.error("Failed to check for recent commentary runs:", error);
    return false;
  }
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
