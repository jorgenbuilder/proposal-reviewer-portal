"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCw, Github, Check, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { VerificationStatus } from "@/lib/github";

interface Proposal {
  id: string;
  title: string;
  topic: string;
  seenAt: string;
  notified: boolean;
  commitHash: string | null;
  proposalUrl: string | null;
  verificationStatus: VerificationStatus;
  verificationRunUrl: string | null;
  viewerSeenAt: string | null;
  reviewForumUrl: string | null;
  reviewedAt: string | null;
}

async function fetchProposals(): Promise<Proposal[]> {
  const response = await fetch("/api/proposals");
  if (!response.ok) {
    throw new Error("Failed to fetch proposals");
  }
  const data = await response.json();
  return data.proposals || [];
}

export function ProposalList() {
  const {
    data: proposals = [],
    isLoading,
    isFetching,
    error,
    dataUpdatedAt,
    refetch,
  } = useQuery({
    queryKey: ["proposals"],
    queryFn: fetchProposals,
    refetchInterval: 60 * 1000, // Poll every 1 minute
  });

  const [testingNotification, setTestingNotification] = useState(false);
  const [testingFailure, setTestingFailure] = useState(false);
  const [testResult, setTestResult] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const handleTestNotification = async (simulateFailure: boolean) => {
    if (simulateFailure) {
      setTestingFailure(true);
    } else {
      setTestingNotification(true);
    }
    setTestResult(null);

    try {
      const response = await fetch("/api/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulateFailure }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          type: "success",
          message: data.message,
        });
      } else if (response.status === 404) {
        setTestResult({
          type: "error",
          message: "No subscriptions found. Please enable notifications first.",
        });
      } else {
        setTestResult({
          type: "error",
          message: data.message || "Failed to send notification",
        });
      }
    } catch (err) {
      console.error("Test notification error:", err);
      setTestResult({
        type: "error",
        message: "An unexpected error occurred",
      });
    } finally {
      setTestingNotification(false);
      setTestingFailure(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold">ICP Proposal Reviewer</h1>
          <p className="text-sm text-muted-foreground">
            Protocol Canister Management Proposals
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Test Notification Buttons */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Test Notifications</CardTitle>
            <CardDescription>
              Verify your notification setup is working correctly
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleTestNotification(false)}
                disabled={testingNotification || testingFailure}
              >
                {testingNotification ? "Sending..." : "Test Notification"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTestNotification(true)}
                disabled={testingNotification || testingFailure}
              >
                {testingFailure ? "Simulating..." : "Test Failure"}
              </Button>
            </div>
            {testResult && (
              <p
                className={`text-sm ${
                  testResult.type === "success"
                    ? "text-green-600 dark:text-green-400"
                    : testResult.type === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {testResult.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Last Updated */}
        {dataUpdatedAt > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1 hover:bg-muted rounded-sm transition-colors disabled:opacity-50"
              title="Refresh proposals"
            >
              <RotateCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        )}

        {/* Proposals List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-pulse text-muted-foreground">
              Loading proposals...
            </div>
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-destructive">
                Failed to load proposals. Please try again later.
              </p>
            </CardContent>
          </Card>
        ) : proposals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No proposals yet. You&apos;ll be notified when new ones appear.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {proposals.map((proposal) => (
              <ProposalCard key={proposal.id} proposal={proposal} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function VerificationStatusIndicator({ status }: { status: VerificationStatus }) {
  const config = {
    verified: { color: "bg-green-500", animate: false, label: "Verified" },
    failed: { color: "bg-red-500", animate: false, label: "Failed" },
    in_progress: { color: "bg-yellow-500", animate: true, label: "In Progress" },
    pending: { color: "bg-gray-400 dark:bg-gray-600", animate: true, label: "Pending" },
  };
  const { color, animate, label } = config[status];

  return (
    <div className="flex items-center gap-1.5" title={`Verification: ${label}`}>
      <div className={`w-2 h-2 rounded-full ${color} ${animate ? "animate-pulse" : ""}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function ReviewStatusIndicator({ proposal }: { proposal: Proposal }) {
  // State 1: Not yet viewed by reviewer
  if (!proposal.viewerSeenAt) {
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">New</span>
      </div>
    );
  }

  // State 2: Viewed but not reviewed
  if (!proposal.reviewForumUrl) {
    return (
      <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" />
        <span className="text-xs font-medium">Pending review</span>
      </div>
    );
  }

  // State 3: Reviewed
  const reviewedDate = proposal.reviewedAt ? new Date(proposal.reviewedAt) : null;
  const formattedDate = reviewedDate
    ? reviewedDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <a
      href={proposal.reviewForumUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 text-green-600 dark:text-green-400 hover:underline"
      title={reviewedDate ? `Reviewed on ${reviewedDate.toLocaleString()}` : "Reviewed"}
    >
      <Check className="h-3.5 w-3.5" />
      <span className="text-xs font-medium">
        Reviewed{formattedDate && ` ${formattedDate}`}
      </span>
    </a>
  );
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const dashboardUrl = `https://dashboard.internetcomputer.org/proposal/${proposal.id}`;

  // Build GitHub diff URL from proposal URL if it's a GitHub URL
  const githubDiffUrl = proposal.proposalUrl?.includes("github.com")
    ? proposal.proposalUrl
    : proposal.commitHash
    ? `https://github.com/search?q=${proposal.commitHash}&type=commits`
    : null;

  const isUnseen = !proposal.viewerSeenAt;

  return (
    <Card className={isUnseen ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-background" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              <a href={`/proposals/${proposal.id}`} className="hover:underline">
                #{proposal.id}: {proposal.title}
              </a>
            </CardTitle>
            <CardDescription className="flex items-center gap-3">
              <span>{proposal.topic}</span>
              <VerificationStatusIndicator status={proposal.verificationStatus} />
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <ReviewStatusIndicator proposal={proposal} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm">
          <Button variant="outline" size="sm" asChild>
            <a href={`/proposals/${proposal.id}`}>View Details</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              IC Dashboard
            </a>
          </Button>
          {/* GitHub Diff Link */}
          {proposal.commitHash && githubDiffUrl && (
            <a
              href={githubDiffUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              <Github className="h-3 w-3" />
              <span className="font-mono">{proposal.commitHash.slice(0, 7)}</span>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
