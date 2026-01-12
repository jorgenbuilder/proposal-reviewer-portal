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
import { getProposal } from "@/lib/nns";
import { getVerificationRunForProposal, getDashboardUrl } from "@/lib/github";
import {
  findForumTopicForProposal,
  getForumCategoryUrl,
} from "@/lib/forum";

interface ProposalPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const proposalId = BigInt(id);

  const [proposal, verificationRun, forumTopic] = await Promise.all([
    getProposal(proposalId),
    getVerificationRunForProposal(id),
    findForumTopicForProposal(id),
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

        {/* Forum Discussion */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Forum Discussion</CardTitle>
            <CardDescription>
              {forumTopic
                ? "Join the community discussion about this proposal"
                : "No forum post found yet for this proposal"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {forumTopic ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">{forumTopic.title}</p>
                <Button variant="outline" asChild>
                  <a
                    href={forumTopic.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Forum Discussion
                  </a>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A forum post for this proposal has not been created yet, or
                  could not be found. Check the NNS Proposal Discussions
                  category for updates.
                </p>
                <Button variant="outline" asChild>
                  <a
                    href={forumCategoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Browse NNS Proposal Discussions
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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

        {/* AI Summary Placeholder */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">
              AI Summary
            </CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              An AI-generated summary of the code changes will appear here in a
              future update.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
