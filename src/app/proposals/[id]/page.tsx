import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BuildVerificationWidget } from "@/components/build-verification-widget";
import { ForumLinksWidget } from "@/components/forum-links-widget";
import { ProposalSeenMarker } from "@/components/proposal-seen-marker";
import { ReviewSubmitWidget } from "@/components/review-submit-widget";
import { CommentaryWidget } from "@/components/commentary-widget";
import { getProposal } from "@/lib/nns";
import { getVerificationRunForProposal, getDashboardUrl } from "@/lib/github";
import { getForumCategoryUrl } from "@/lib/forum";
import { getLatestCommentary } from "@/lib/db";

interface ProposalPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const proposalId = BigInt(id);

  const [proposal, verificationRun, commentary] = await Promise.all([
    getProposal(proposalId),
    getVerificationRunForProposal(id),
    getLatestCommentary(id),
  ]);

  if (!proposal) {
    notFound();
  }

  const dashboardUrl = getDashboardUrl(id);
  const forumCategoryUrl = getForumCategoryUrl();

  // Determine if this is an upgrade code proposal by checking for WASM hash or canister ID
  const isUpgradeProposal = !!(
    proposal.expectedWasmHash || proposal.canisterId
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:underline"
          >
            &larr; Back to proposals
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Mark proposal as seen when page loads */}
        <ProposalSeenMarker proposalId={id} />

        <Card>
          <CardHeader>
            <CardDescription>Proposal #{id}</CardDescription>
            <CardTitle className="text-2xl">{proposal.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a
                  href={dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on IC Dashboard
                </a>
              </Button>
              {proposal.url && (
                <Button variant="outline" asChild>
                  <a
                    href={proposal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Proposal URL
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Forum Discussion - Client Component */}
        <ForumLinksWidget
          proposalId={id}
          forumCategoryUrl={forumCategoryUrl}
        />

        {/* Review Submission Widget */}
        <ReviewSubmitWidget proposalId={id} />

        {/* Build Verification Widget - Always Present */}
        <BuildVerificationWidget
          isUpgradeProposal={isUpgradeProposal}
          verificationRun={verificationRun}
          proposalId={id}
        />

        {/* Technical Details - Only for upgrade proposals */}
        {isUpgradeProposal && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Technical Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {proposal.canisterId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Target Canister
                    </p>
                    <p className="font-mono text-sm break-all">
                      {proposal.canisterId}
                    </p>
                  </div>
                )}
                {proposal.commitHash && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Source Commit
                    </p>
                    <p className="font-mono text-sm break-all">
                      {proposal.commitHash}
                    </p>
                  </div>
                )}
                {proposal.expectedWasmHash && (
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Expected WASM Hash
                    </p>
                    <p className="font-mono text-sm break-all">
                      {proposal.expectedWasmHash}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{proposal.summary}</ReactMarkdown>
          </CardContent>
        </Card>

        {/* AI Commentary */}
        <CommentaryWidget commentary={commentary} proposalId={id} />
      </main>
    </div>
  );
}
