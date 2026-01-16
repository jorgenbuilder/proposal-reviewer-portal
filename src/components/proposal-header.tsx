"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ActionRun } from "@/lib/github";

interface ForumThread {
  id: string;
  proposal_id: string;
  forum_url: string;
  thread_title: string | null;
  added_at: string;
}

interface ProposalHeaderProps {
  proposalId: string;
  title: string;
  dashboardUrl: string;
  proposalUrl?: string | null;
  canisterId?: string | null;
  commitHash?: string | null;
  expectedWasmHash?: string | null;
  forumCategoryUrl: string;
  verificationRun: ActionRun | null;
  isUpgradeProposal: boolean;
}

async function fetchForumThreads(proposalId: string): Promise<ForumThread[]> {
  const response = await fetch(`/api/forum-links?proposalId=${proposalId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch forum threads");
  }
  const data = await response.json();
  return data.threads || [];
}

type VerificationStatus =
  | "verified"
  | "failed"
  | "in_progress"
  | "pending"
  | "not_expected";

function getVerificationStatus(
  isUpgradeProposal: boolean,
  verificationRun: ActionRun | null
): VerificationStatus {
  if (!isUpgradeProposal) {
    return "not_expected";
  }
  if (!verificationRun) {
    return "pending";
  }
  if (verificationRun.status !== "completed") {
    return "in_progress";
  }
  return verificationRun.conclusion === "success" ? "verified" : "failed";
}

function StatusIndicator({ status }: { status: VerificationStatus }) {
  const statusConfig = {
    verified: { color: "bg-green-500", animate: false },
    failed: { color: "bg-red-500", animate: false },
    in_progress: { color: "bg-yellow-500", animate: true },
    pending: { color: "bg-gray-400 dark:bg-gray-600", animate: true },
    not_expected: { color: "bg-gray-300 dark:bg-gray-700", animate: false },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`w-2.5 h-2.5 rounded-full ${config.color} ${
        config.animate ? "animate-pulse" : ""
      }`}
    />
  );
}

function getStatusText(status: VerificationStatus): string {
  switch (status) {
    case "verified":
      return "Build Verified";
    case "failed":
      return "Verification Failed";
    case "in_progress":
      return "Verification In Progress";
    case "pending":
      return "Verification Pending";
    case "not_expected":
      return "No Verification Required";
  }
}

export function ProposalHeader({
  proposalId,
  title,
  dashboardUrl,
  proposalUrl,
  canisterId,
  commitHash,
  expectedWasmHash,
  forumCategoryUrl,
  verificationRun,
  isUpgradeProposal,
}: ProposalHeaderProps) {
  const {
    data: threads = [],
    isLoading: threadsLoading,
    error: threadsError,
  } = useQuery({
    queryKey: ["forumThreads", proposalId],
    queryFn: () => fetchForumThreads(proposalId),
  });

  const verificationStatus = getVerificationStatus(
    isUpgradeProposal,
    verificationRun
  );
  const statusText = getStatusText(verificationStatus);

  const borderColor =
    verificationStatus === "failed"
      ? "border-red-500/50"
      : verificationStatus === "verified"
      ? "border-green-500/50"
      : "";

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <p className="text-sm text-muted-foreground">Proposal #{proposalId}</p>
            <CardTitle className="text-2xl">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <StatusIndicator status={verificationStatus} />
            <span
              className={
                verificationStatus === "verified"
                  ? "text-green-600 dark:text-green-400"
                  : verificationStatus === "failed"
                  ? "text-red-600 dark:text-red-400"
                  : "text-muted-foreground"
              }
            >
              {statusText}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Links */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              View on IC Dashboard
            </a>
          </Button>
          {proposalUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={proposalUrl} target="_blank" rel="noopener noreferrer">
                Proposal URL
              </a>
            </Button>
          )}
          {verificationRun && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={verificationRun.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Verification Run
                {verificationStatus === "verified" && (
                  <span className="ml-1 text-green-600">&#10003;</span>
                )}
                {verificationStatus === "failed" && (
                  <span className="ml-1 text-red-600">&#10007;</span>
                )}
              </a>
            </Button>
          )}
        </div>

        {/* Technical Details - Only for upgrade proposals */}
        {isUpgradeProposal && (canisterId || commitHash || expectedWasmHash) && (
          <div className="pt-3 border-t">
            <p className="text-sm font-medium mb-2">Technical Details</p>
            <div className="grid gap-3 md:grid-cols-2 text-sm">
              {canisterId && (
                <div>
                  <p className="text-xs text-muted-foreground">Target Canister</p>
                  <p className="font-mono text-xs break-all">{canisterId}</p>
                </div>
              )}
              {commitHash && (
                <div>
                  <p className="text-xs text-muted-foreground">Source Commit</p>
                  <p className="font-mono text-xs break-all">{commitHash}</p>
                </div>
              )}
              {expectedWasmHash && (
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground">Expected WASM Hash</p>
                  <p className="font-mono text-xs break-all">{expectedWasmHash}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Forum Threads */}
        <div className="pt-3 border-t">
          <p className="text-sm font-medium mb-2">Forum Discussion</p>
          {threadsLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : threadsError ? (
            <p className="text-sm text-destructive">Failed to load threads</p>
          ) : threads.length > 0 ? (
            <div className="space-y-1">
              {threads.map((thread) => (
                <a
                  key={thread.id}
                  href={thread.forum_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm text-primary hover:underline"
                >
                  {thread.thread_title || thread.forum_url}
                </a>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">No discussions yet</span>
              <Button variant="link" size="sm" className="h-auto p-0" asChild>
                <a
                  href={forumCategoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Browse forum
                </a>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
