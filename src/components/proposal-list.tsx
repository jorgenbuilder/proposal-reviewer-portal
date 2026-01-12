"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Proposal {
  id: string;
  title: string;
  topic: string;
  summary: string;
  url: string;
  seenAt: string;
}

export function ProposalList() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProposals() {
      try {
        const response = await fetch("/api/proposals");
        if (response.ok) {
          const data = await response.json();
          setProposals(data.proposals || []);
        }
      } catch (error) {
        console.error("Failed to fetch proposals:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchProposals();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-semibold">ICP Proposal Reviewer</h1>
          <p className="text-sm text-muted-foreground">Protocol Canister Management Proposals</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-pulse text-muted-foreground">Loading proposals...</div>
          </div>
        ) : proposals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No proposals yet. You&apos;ll be notified when new ones appear.</p>
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
              <a
                href={`/proposals/${proposal.id}`}
                className="hover:underline"
              >
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
