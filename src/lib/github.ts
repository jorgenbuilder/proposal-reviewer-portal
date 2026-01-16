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

// Check if ANY verification run exists for this proposal (regardless of status or time)
// Returns true if any verify workflow exists - prevents duplicate runs
export async function hasAnyVerificationRun(
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

    // Find ANY verify workflow for this proposal (regardless of status)
    const existingRun = data.workflow_runs?.find((r: {
      display_title?: string;
    }) => {
      return r.display_title?.includes(`Verify Proposal #${proposalId}`);
    });

    return !!existingRun;
  } catch (error) {
    console.error("Failed to check for existing verification run:", error);
    return false;
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

export interface CommitDiffStats {
  additions: number;
  deletions: number;
  filesChanged?: number;
  pathFilter?: string;
}

interface GitHubFileChange {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
}

// Parse a GitHub URL to extract owner, repo, commit SHA, and optional path
export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
  sha: string;
  path: string | null;
} | null {
  // Handle formats like:
  // - https://github.com/owner/repo/commit/sha
  // - https://github.com/owner/repo/tree/sha
  // - https://github.com/owner/repo/tree/sha/path/to/dir
  // - https://github.com/owner/repo/compare/base...sha

  // Match tree URLs with optional path: /tree/sha or /tree/sha/path/to/dir
  const treeMatch = url.match(
    /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([a-f0-9]+)(?:\/(.+))?/i
  );
  if (treeMatch) {
    const [, owner, repo, sha, path] = treeMatch;
    return { owner, repo, sha, path: path || null };
  }

  // Match commit URLs: /commit/sha
  const commitMatch = url.match(
    /github\.com\/([^\/]+)\/([^\/]+)\/commit\/([a-f0-9]+)/i
  );
  if (commitMatch) {
    const [, owner, repo, sha] = commitMatch;
    return { owner, repo, sha, path: null };
  }

  // Match compare URLs: /compare/base...sha
  const compareMatch = url.match(
    /github\.com\/([^\/]+)\/([^\/]+)\/compare\/[^\.]+\.\.\.?([a-f0-9]+)/i
  );
  if (compareMatch) {
    const [, owner, repo, sha] = compareMatch;
    return { owner, repo, sha, path: null };
  }

  return null;
}

// Fetch commit details with per-file stats from GitHub API
async function fetchCommitWithFiles(
  owner: string,
  repo: string,
  sha: string
): Promise<{ stats: { additions: number; deletions: number }; files: GitHubFileChange[] } | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
      {
        headers,
        next: { revalidate: 3600 }, // Cache for 1 hour since commits don't change
      }
    );

    if (!response.ok) {
      console.error(`GitHub API error fetching commit ${sha}:`, response.status);
      return null;
    }

    const data = await response.json();
    return {
      stats: data.stats || { additions: 0, deletions: 0 },
      files: data.files || [],
    };
  } catch (error) {
    console.error("Failed to fetch commit:", error);
    return null;
  }
}

// Calculate diff stats, optionally filtering to files matching a path prefix
function calculateFilteredStats(
  files: GitHubFileChange[],
  pathFilter: string | null
): CommitDiffStats {
  if (!pathFilter) {
    // No filter - sum all files
    let additions = 0;
    let deletions = 0;
    for (const file of files) {
      additions += file.additions;
      deletions += file.deletions;
    }
    return { additions, deletions, filesChanged: files.length };
  }

  // Filter to files matching the path prefix
  const matchingFiles = files.filter((f) =>
    f.filename.startsWith(pathFilter) || f.filename.startsWith(pathFilter + "/")
  );

  let additions = 0;
  let deletions = 0;
  for (const file of matchingFiles) {
    additions += file.additions;
    deletions += file.deletions;
  }

  return {
    additions,
    deletions,
    filesChanged: matchingFiles.length,
    pathFilter,
  };
}

// Fetch diff stats for a commit from any GitHub repo URL
// If the URL contains a path (e.g., /tree/sha/rs/nns/governance),
// only files under that path are counted
export async function getCommitDiffStats(
  commitUrl: string
): Promise<CommitDiffStats | null> {
  try {
    const parsed = parseGitHubUrl(commitUrl);
    if (!parsed) {
      return null;
    }

    const { owner, repo, sha, path } = parsed;
    const commit = await fetchCommitWithFiles(owner, repo, sha);
    if (!commit) {
      return null;
    }

    return calculateFilteredStats(commit.files, path);
  } catch (error) {
    console.error("Failed to fetch commit diff stats:", error);
    return null;
  }
}

// Fetch diff stats using just the commit hash (tries common ICP repos)
// Since we don't have a path, returns total commit stats
export async function getCommitDiffStatsByHash(
  commitHash: string,
  pathFilter?: string
): Promise<CommitDiffStats | null> {
  // Common DFINITY repos where ICP proposals typically come from
  const repos = [
    "dfinity/ic",
    "dfinity/nns-dapp",
    "dfinity/internet-identity",
    "dfinity/sns-aggregator",
  ];

  for (const repoPath of repos) {
    const [owner, repo] = repoPath.split("/");
    const commit = await fetchCommitWithFiles(owner, repo, commitHash);
    if (commit) {
      return calculateFilteredStats(commit.files, pathFilter || null);
    }
  }

  return null;
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
