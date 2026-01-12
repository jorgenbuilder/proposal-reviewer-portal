"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { registerServiceWorker } from "@/lib/push";

interface Proposal {
  id: string;
  title: string;
  topic: string;
  summary: string;
  url: string;
  seenAt: string;
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
    error,
    dataUpdatedAt,
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
      const registration = await registerServiceWorker();
      if (!registration) {
        setTestResult({
          type: "error",
          message: "Service worker not registered",
        });
        return;
      }

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setTestResult({
          type: "error",
          message: "No push subscription found. Please re-enable notifications.",
        });
        return;
      }

      const response = await fetch("/api/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          simulateFailure,
        }),
      });

      const data = await response.json();

      if (simulateFailure && data.simulated) {
        setTestResult({
          type: "info",
          message: data.message,
        });
      } else if (data.success) {
        setTestResult({
          type: "success",
          message: "Notification sent! Check your device.",
        });
      } else if (data.expired) {
        setTestResult({
          type: "error",
          message: data.message,
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
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}
          </p>
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

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const dashboardUrl = `https://dashboard.internetcomputer.org/proposal/${proposal.id}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              <a href={`/proposals/${proposal.id}`} className="hover:underline">
                #{proposal.id}: {proposal.title}
              </a>
            </CardTitle>
            <CardDescription>{proposal.topic}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {proposal.summary}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/proposals/${proposal.id}`}>View Details</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
              IC Dashboard
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
