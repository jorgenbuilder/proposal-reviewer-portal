import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getProposal } from "@/lib/nns";
import { getVerificationRunForProposal, getDashboardUrl } from "@/lib/github";

interface ProposalPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const proposalId = BigInt(id);

  const [proposal, verificationRun] = await Promise.all([
    getProposal(proposalId),
    getVerificationRunForProposal(id),
  ]);

  if (!proposal) {
    notFound();
  }

  const dashboardUrl = getDashboardUrl(id);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
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
                <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
                  View on IC Dashboard
                </a>
              </Button>
              {verificationRun && (
                <Button variant="outline" asChild>
                  <a href={verificationRun.htmlUrl} target="_blank" rel="noopener noreferrer">
                    View Build Verification
                    {verificationRun.conclusion && (
                      <span className="ml-2">
                        {verificationRun.conclusion === "success" ? "✓" : "✗"}
                      </span>
                    )}
                  </a>
                </Button>
              )}
              {proposal.url && (
                <Button variant="outline" asChild>
                  <a href={proposal.url} target="_blank" rel="noopener noreferrer">
                    Proposal URL
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Technical Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {proposal.canisterId && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Target Canister</p>
                  <p className="font-mono text-sm break-all">{proposal.canisterId}</p>
                </div>
              )}
              {proposal.commitHash && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Source Commit</p>
                  <p className="font-mono text-sm break-all">{proposal.commitHash}</p>
                </div>
              )}
              {proposal.expectedWasmHash && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">Expected WASM Hash</p>
                  <p className="font-mono text-sm break-all">{proposal.expectedWasmHash}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Verification Status */}
        {verificationRun && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Build Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div
                  className={`w-3 h-3 rounded-full ${
                    verificationRun.status === "completed"
                      ? verificationRun.conclusion === "success"
                        ? "bg-green-500"
                        : "bg-red-500"
                      : "bg-yellow-500 animate-pulse"
                  }`}
                />
                <div>
                  <p className="font-medium">
                    {verificationRun.status === "completed"
                      ? verificationRun.conclusion === "success"
                        ? "Build Verified"
                        : "Verification Failed"
                      : "Verification In Progress"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {verificationRun.displayTitle}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Summary</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{proposal.summary}</ReactMarkdown>
          </CardContent>
        </Card>

        {/* AI Summary Placeholder */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-lg text-muted-foreground">AI Summary</CardTitle>
            <CardDescription>Coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              An AI-generated summary of the code changes will appear here in a future update.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
