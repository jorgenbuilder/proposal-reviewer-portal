import { ProposalDetailV2 } from "@/components/proposal-detail-v2";
import { getStubProposal, stubVariants, type StubVariant } from "@/lib/design-stub";

// Local-only design playground for ProposalDetailV2.
//
// Visit http://localhost:3000/design/proposal (defaults to ?variant=upgrade).
// Switch fixtures with ?variant=upgrade | install | legacy.
//
// This route is additive and not linked from the live app.

export const dynamic = "force-static";

interface DesignProposalPageProps {
  searchParams: Promise<{ variant?: string }>;
}

export default async function DesignProposalPage({
  searchParams,
}: DesignProposalPageProps) {
  const { variant } = await searchParams;
  const active = (stubVariants.includes(variant as StubVariant)
    ? variant
    : "upgrade") as StubVariant;
  const proposal = getStubProposal(active);

  // Switch fixtures by editing the URL (?variant=upgrade | install | legacy).
  return (
    <div className="min-h-screen bg-background">
      <ProposalDetailV2 proposal={proposal} />
    </div>
  );
}
