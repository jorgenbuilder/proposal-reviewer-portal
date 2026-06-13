// Live governance vote tally for a proposal, from the ICP dashboard API.
// (Only the vote comes from here; all other proposal data uses the existing sources.)

export interface ProposalVote {
  status: "adopt" | "reject" | "open";
  yes: number; // fraction of total voting power (0..1)
  no: number;
  threshold: number; // standard-majority adoption line
}

const STATUS_MAP: Record<string, ProposalVote["status"]> = {
  OPEN: "open",
  ADOPTED: "adopt",
  EXECUTED: "adopt",
  REJECTED: "reject",
  FAILED: "reject",
};

export async function getProposalVote(proposalId: string): Promise<ProposalVote | null> {
  try {
    const res = await fetch(`https://ic-api.internetcomputer.org/api/v3/proposals/${proposalId}`, {
      next: { revalidate: 60 }, // tally moves while open; 60s is plenty for display
    });
    if (!res.ok) return null;
    const d = await res.json();
    const t = d.latest_tally;
    const total = t ? Number(t.total) : 0; // ~1e16; precision loss is irrelevant for a fraction
    return {
      status: STATUS_MAP[String(d.status || "").toUpperCase()] ?? "open",
      yes: t && total ? Number(t.yes) / total : 0,
      no: t && total ? Number(t.no) / total : 0,
      threshold: 0.5,
    };
  } catch {
    return null;
  }
}
