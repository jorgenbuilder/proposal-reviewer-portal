// Review-hub status for a single proposal, read straight from the NNS Technical
// Review Hub canister (mhnfx-niaaa-aaaas-qdluq-cai, mainnet). Reads are anonymous
// — the reviewer principal is just an argument — so no auth/login is needed here.
//
// Status for jorgenbuilder's reviewer identity:
//   - "done"    → the proposal is in the reviewer's review history
//   - "miss"    → the proposal is in the reviewer's missed list (deadline passed,
//                 no review)
//   - "pending" → otherwise; carries the deadline so the UI can count down to it
//
// Interface mirrors interface/reviewer-hub.did in ../ii-automation (fetched live
// from chain). Timestamps are nanoseconds since epoch.
import "server-only";
import { HttpAgent, Actor } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";

const HUB_CANISTER_ID = "mhnfx-niaaa-aaaas-qdluq-cai";
// jorgenbuilder's registered reviewer principal (id.ai). Reads pass it as an arg.
const REVIEWER_PRINCIPAL =
  "swkkr-obybt-jro3j-e522f-blc54-3wstw-7h7un-cfghi-4a7rf-45fus-jae";

const hubIdlFactory = () => {
  const Proposal = IDL.Record({
    creationDate: IDL.Int,
    deadline: IDL.Int,
    deadlineDate: IDL.Int,
    proposalId: IDL.Nat,
    timestamp: IDL.Int,
    title: IDL.Text,
    topic: IDL.Nat,
  });
  const Reviewer = IDL.Record({
    forumProfileUrl: IDL.Text,
    nickname: IDL.Text,
    principal: IDL.Principal,
  });
  const Review = IDL.Record({
    link: IDL.Text,
    proposalId: IDL.Nat,
    recommendation: IDL.Variant({ adopt: IDL.Null, reject: IDL.Null }),
    reviewer: Reviewer,
    status: IDL.Variant({ paid: IDL.Null, volunteer: IDL.Null }),
    timestamp: IDL.Int,
    topic: IDL.Nat,
  });
  const ProposalWithCounts = IDL.Record({
    adoptCount: IDL.Nat,
    creationDate: IDL.Int,
    deadline: IDL.Int,
    deadlineDate: IDL.Int,
    proposalId: IDL.Nat,
    rejectCount: IDL.Nat,
    timestamp: IDL.Int,
    title: IDL.Text,
    topic: IDL.Nat,
    totalReviewCount: IDL.Nat,
  });
  return IDL.Service({
    getProposal: IDL.Func([IDL.Nat], [IDL.Opt(Proposal)], ["query"]),
    getProposals: IDL.Func([IDL.Opt(IDL.Nat)], [IDL.Vec(ProposalWithCounts)], ["query"]),
    getReviewerReviewHistory: IDL.Func([IDL.Principal], [IDL.Vec(Review)], ["query"]),
    getReviewerMissedProposals: IDL.Func([IDL.Principal], [IDL.Vec(Proposal)], ["query"]),
  });
};

interface HubActor {
  getProposal: (id: bigint) => Promise<[{ deadline: bigint }] | []>;
  getProposals: (topic: []) => Promise<{ proposalId: bigint; deadline: bigint }[]>;
  getReviewerReviewHistory: (p: Principal) => Promise<{ proposalId: bigint }[]>;
  getReviewerMissedProposals: (p: Principal) => Promise<{ proposalId: bigint }[]>;
}

let cachedActor: HubActor | null = null;
async function hubActor(): Promise<HubActor> {
  if (cachedActor) return cachedActor;
  const agent = await HttpAgent.create({ host: "https://icp-api.io" });
  cachedActor = Actor.createActor(hubIdlFactory, {
    agent,
    canisterId: HUB_CANISTER_ID,
  }) as unknown as HubActor;
  return cachedActor;
}

export type HubStatus =
  | { state: "done" }
  | { state: "miss" }
  | { state: "pending"; deadlineMs: number };

/**
 * Hub review status for a proposal, for jorgenbuilder's reviewer identity.
 * Returns null if the proposal isn't tracked by the hub or the canister read fails.
 */
export async function getHubStatus(proposalId: string): Promise<HubStatus | null> {
  try {
    const hub = await hubActor();
    const pid = BigInt(proposalId);
    const reviewer = Principal.fromText(REVIEWER_PRINCIPAL);
    const [history, missed, proposalOpt] = await Promise.all([
      hub.getReviewerReviewHistory(reviewer),
      hub.getReviewerMissedProposals(reviewer),
      hub.getProposal(pid),
    ]);
    if (history.some((r) => r.proposalId === pid)) return { state: "done" };
    if (missed.some((p) => p.proposalId === pid)) return { state: "miss" };
    const proposal = proposalOpt[0];
    if (!proposal) return null;
    return { state: "pending", deadlineMs: Number(proposal.deadline / 1_000_000n) };
  } catch {
    return null;
  }
}

/**
 * Hub status for many proposals in one batch of reads (for the list page).
 * Three canister queries total — history, missed, and all proposals with their
 * deadlines — keyed by proposal id (string). Returns an empty map on failure.
 */
export async function getHubStatusMap(): Promise<Map<string, HubStatus>> {
  const map = new Map<string, HubStatus>();
  try {
    const hub = await hubActor();
    const reviewer = Principal.fromText(REVIEWER_PRINCIPAL);
    const [history, missed, proposals] = await Promise.all([
      hub.getReviewerReviewHistory(reviewer),
      hub.getReviewerMissedProposals(reviewer),
      hub.getProposals([]),
    ]);
    // Base: every tracked proposal is pending with its deadline.
    for (const p of proposals) {
      map.set(p.proposalId.toString(), {
        state: "pending",
        deadlineMs: Number(p.deadline / 1_000_000n),
      });
    }
    // Terminal states override (a proposal can't be both, but done wins last).
    for (const p of missed) map.set(p.proposalId.toString(), { state: "miss" });
    for (const r of history) map.set(r.proposalId.toString(), { state: "done" });
  } catch {
    // empty map — list simply renders without hub status
  }
  return map;
}
