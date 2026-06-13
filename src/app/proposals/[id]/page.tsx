import { notFound } from "next/navigation";
import { ProposalSeenMarker } from "@/components/proposal-seen-marker";
import { ProposalDetailV2 } from "@/components/proposal-detail-v2";
import { buildParsedProposal } from "@/lib/proposal-view";

interface ProposalPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;
  const proposal = await buildParsedProposal(id);

  if (!proposal) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <ProposalSeenMarker proposalId={id} />
      <ProposalDetailV2 proposal={proposal} />
    </div>
  );
}
