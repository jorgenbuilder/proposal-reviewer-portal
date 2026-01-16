import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalHeader } from "@/components/proposal-header";
import { ProposalSeenMarker } from "@/components/proposal-seen-marker";
import { ReviewSubmitWidget } from "@/components/review-submit-widget";
import { CommentaryWidget } from "@/components/commentary-widget";
import { getProposal } from "@/lib/nns";
import { getVerificationRunForProposal, getDashboardUrl } from "@/lib/github";
import { getForumCategoryUrl } from "@/lib/forum";
import { getLatestCommentary, getProposalDiffStats } from "@/lib/db";

interface ProposalPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const proposalId = BigInt(id);

  const [proposal, verificationRun, commentary, diffStats] = await Promise.all([
    getProposal(proposalId),
    getVerificationRunForProposal(id),
    getLatestCommentary(id),
    getProposalDiffStats(id),
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

        {/* Unified Header with title, links, tech details, forum, and verification status */}
        <ProposalHeader
          proposalId={id}
          title={proposal.title}
          dashboardUrl={dashboardUrl}
          proposalUrl={proposal.url}
          canisterId={proposal.canisterId}
          commitHash={proposal.commitHash}
          expectedWasmHash={proposal.expectedWasmHash}
          forumCategoryUrl={forumCategoryUrl}
          verificationRun={verificationRun}
          isUpgradeProposal={isUpgradeProposal}
          linesAdded={diffStats?.linesAdded ?? null}
          linesRemoved={diffStats?.linesRemoved ?? null}
        />

        {/* AI Commentary */}
        <CommentaryWidget commentary={commentary} proposalId={id} />

        {/* Review Submission Widget */}
        <ReviewSubmitWidget proposalId={id} />
      </main>
    </div>
  );
}
