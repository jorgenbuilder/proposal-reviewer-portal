import { HttpAgent, Actor } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { IDL } from "@dfinity/candid";

const GOVERNANCE_CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// Topic 17 = Protocol Canister Management (InstallCode proposals)
export const PROTOCOL_CANISTER_MANAGEMENT_TOPIC = 17;

// Only verify proposals after this ID
export const MIN_PROPOSAL_ID = 139768n;

export interface ProposalInfo {
  id: bigint;
  topic: number;
  status: number;
  proposer: bigint;
  title: string;
  summary: string;
  url: string;
}

export interface ProposalDetail {
  id: bigint;
  topic: number;
  status: number;
  title: string;
  summary: string;
  url: string;
  commitHash: string | null;
  expectedWasmHash: string | null;
  canisterId: string | null;
}

// IDL factory for list_proposals
const listProposalsIdlFactory = () => {
  const ListProposalInfo = IDL.Record({
    id: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
    proposer: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
    proposal: IDL.Opt(
      IDL.Record({
        title: IDL.Opt(IDL.Text),
        summary: IDL.Text,
        url: IDL.Text,
        action: IDL.Opt(
          IDL.Variant({
            InstallCode: IDL.Record({
              wasm_module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
              canister_id: IDL.Opt(IDL.Principal),
            }),
          })
        ),
      })
    ),
    topic: IDL.Int32,
    status: IDL.Int32,
  });

  const ListProposalInfoResponse = IDL.Record({
    proposal_info: IDL.Vec(ListProposalInfo),
  });

  return IDL.Service({
    list_proposals: IDL.Func(
      [
        IDL.Record({
          include_reward_status: IDL.Vec(IDL.Int32),
          omit_large_fields: IDL.Opt(IDL.Bool),
          before_proposal: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
          limit: IDL.Nat32,
          exclude_topic: IDL.Vec(IDL.Int32),
          include_all_manage_neuron_proposals: IDL.Opt(IDL.Bool),
          include_status: IDL.Vec(IDL.Int32),
        }),
      ],
      [ListProposalInfoResponse],
      ["query"]
    ),
  });
};

// IDL factory for get_proposal_info
const getProposalIdlFactory = () => {
  const InstallCode = IDL.Record({
    skip_stopping_before_installing: IDL.Opt(IDL.Bool),
    wasm_module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    canister_id: IDL.Opt(IDL.Principal),
    arg_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    install_mode: IDL.Opt(IDL.Int32),
  });

  const UpdateCanisterSettings = IDL.Record({
    canister_id: IDL.Opt(IDL.Principal),
    settings: IDL.Opt(IDL.Record({})),
  });

  const ProposalInfo = IDL.Record({
    id: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
    proposer: IDL.Opt(IDL.Record({ id: IDL.Nat64 })),
    proposal: IDL.Opt(
      IDL.Record({
        title: IDL.Opt(IDL.Text),
        summary: IDL.Text,
        url: IDL.Text,
        action: IDL.Opt(
          IDL.Variant({
            InstallCode: InstallCode,
            UpdateCanisterSettings: UpdateCanisterSettings,
          })
        ),
      })
    ),
    topic: IDL.Int32,
    status: IDL.Int32,
    executed_timestamp_seconds: IDL.Nat64,
  });

  return IDL.Service({
    get_proposal_info: IDL.Func(
      [IDL.Nat64],
      [IDL.Opt(ProposalInfo)],
      ["query"]
    ),
  });
};

function createAgent() {
  return HttpAgent.create({ host: "https://icp-api.io" });
}

function bytesToHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractCommitHash(text: string): string | null {
  const commitRegex = /\b([a-f0-9]{40})\b/gi;
  const match = text.match(commitRegex);
  return match ? match[0] : null;
}

export async function listProposals(
  limit: number = 100
): Promise<ProposalInfo[]> {
  const agent = await createAgent();

  const governance = Actor.createActor(listProposalsIdlFactory, {
    agent,
    canisterId: Principal.fromText(GOVERNANCE_CANISTER_ID),
  });

  const result = (await governance.list_proposals({
    include_reward_status: [],
    omit_large_fields: [true],
    before_proposal: [],
    limit,
    exclude_topic: [],
    include_all_manage_neuron_proposals: [false],
    include_status: [],
  })) as { proposal_info: unknown[] };

  return result.proposal_info.map((p: unknown) => {
    const proposal = p as {
      id?: [{ id: bigint }];
      proposer?: [{ id: bigint }];
      topic: number;
      status: number;
      proposal?: [{ title?: [string]; summary: string; url: string }];
    };
    return {
      id: proposal.id?.[0]?.id || 0n,
      topic: Number(proposal.topic),
      status: Number(proposal.status),
      proposer: proposal.proposer?.[0]?.id || 0n,
      title: proposal.proposal?.[0]?.title?.[0] || "Untitled",
      summary: proposal.proposal?.[0]?.summary || "",
      url: proposal.proposal?.[0]?.url || "",
    };
  });
}

export async function getProposal(
  proposalId: bigint
): Promise<ProposalDetail | null> {
  const agent = await createAgent();

  const governance = Actor.createActor(getProposalIdlFactory, {
    agent,
    canisterId: Principal.fromText(GOVERNANCE_CANISTER_ID),
  });

  const result = (await governance.get_proposal_info(proposalId)) as unknown[];

  if (!result || result.length === 0 || !result[0]) {
    return null;
  }

  const proposalInfo = result[0] as {
    id?: [{ id: bigint }];
    topic: number;
    status: number;
    proposal?: [
      {
        title?: [string];
        summary: string;
        url: string;
        action?: [
          {
            InstallCode?: {
              wasm_module_hash?: [number[]];
              canister_id?: [Principal];
            };
          }
        ];
      }
    ];
  };

  const proposal = proposalInfo.proposal?.[0];
  if (!proposal) {
    return null;
  }

  const title = proposal.title?.[0] || "Untitled";
  const summary = proposal.summary || "";
  const url = proposal.url || "";

  let expectedWasmHash: string | null = null;
  let canisterId: string | null = null;

  const action = proposal.action?.[0];
  if (action?.InstallCode) {
    const installCode = action.InstallCode;
    if (installCode.wasm_module_hash?.[0]) {
      expectedWasmHash = bytesToHex(installCode.wasm_module_hash[0]);
    }
    if (installCode.canister_id?.[0]) {
      canisterId = installCode.canister_id[0].toText();
    }
  }

  const combinedText = `${title}\n${summary}\n${url}`;
  const commitHash = extractCommitHash(combinedText);

  return {
    id: proposalInfo.id?.[0]?.id || proposalId,
    topic: Number(proposalInfo.topic),
    status: Number(proposalInfo.status),
    title,
    summary,
    url,
    commitHash,
    expectedWasmHash,
    canisterId,
  };
}

export function filterNewProposals(
  proposals: ProposalInfo[],
  trackedTopics: number[],
  seenProposalIds: Set<string>,
  minProposalId: bigint
): ProposalInfo[] {
  return proposals.filter((p) => {
    const idStr = p.id.toString();

    // Must be after minimum proposal ID
    if (p.id < minProposalId) {
      return false;
    }

    // Must be in tracked topics
    if (!trackedTopics.includes(p.topic)) {
      return false;
    }

    // Must not already be seen
    if (seenProposalIds.has(idStr)) {
      return false;
    }

    return true;
  });
}
