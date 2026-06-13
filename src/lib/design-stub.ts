// Local design-session stub data for the redesigned proposal detail view.
//
// This file is intentionally additive and is NOT wired into the live app. It
// feeds the playground route at /design/proposal so the owner can iterate on
// `ProposalDetailV2` with realistic, hand-authored fixtures.
//
// `ParsedProposal` is the shape a future parser must produce from the raw NNS
// proposal + verification + commentary data. See the bottom of this file for
// notes on what each field maps to in the real pipeline.

export interface ParsedProposal {
  proposalId: string;
  title: string;
  proposer: string;
  topic: string;
  summaryMarkdown: string;
  /** Extracted, named sections of the proposer's description (e.g. "Features & Fixes"). */
  description: { heading: string; markdown: string }[];
  /** One-paragraph "what this does" blurb, surfaced prominently. */
  highlight: string;
  repo: { owner: string; name: string; url: string };
  /** Canonical DFINITY forum post for the proposal (header link target). */
  forumPostUrl?: string | null;
  /**
   * Lifecycle of our forum review post, surfaced on the header forum button:
   * - "none":       no DFINITY forum post discovered for this proposal yet.
   * - "discovered": the official forum post exists; `url` points at it.
   * - "draft":      we've posted, but only the initial automated verification
   *                 header (provisional — final analysis not yet written).
   * - "final":      our complete review has been posted.
   * `url` is the link target for every state except "none".
   */
  forum: {
    state: "none" | "discovered" | "draft" | "final";
    url?: string | null;
  };
  targetCommit: string;
  previousCommit?: string;
  commits: {
    hash: string;
    subject: string;
    url: string;
    verified: boolean;
    /** Per-commit AI review/summary (markdown), shown in a collapsible row. */
    review?: string;
    added?: number;
    removed?: number;
  }[];
  canisterId?: string;
  installMode?: string;
  wasmHash?: string;
  argHash?: string | null;
  verification: {
    status: "verified" | "failed" | "in_progress" | "pending";
    runUrl?: string;
    /**
     * 1-based self-healing iteration the verifier is currently on. Only
     * meaningful while status is "in_progress"; the gh-verifier auto-fix loop
     * re-runs a failed build and reports which attempt it's on. Undefined when
     * no self-healing is in flight.
     */
    healingIteration?: number;
  };
  diff?: { added: number; removed: number };
  reviewPostUrl?: string | null;
  /**
   * AI commentary, mirroring the content the live CommentaryWidget shows
   * (overall summary, why-now, sources, confidence, incompleteness), just in a
   * tight collapsible layout. Per-commit summaries live on `commits[].review`.
   */
  commentary?: {
    title: string;
    overallSummary: string;
    whyNow?: string;
    sources?: { label: string; url?: string }[];
    confidenceNotes?: string;
    analysisIncomplete?: boolean;
    incompleteReason?: string;
    costUsd?: number;
    durationMs?: number;
    turns?: number;
    generatedAt?: string;
  } | null;
  /**
   * Chronological log of automated + human review activity (verification runs,
   * self-healing attempts, commentary generation, forum posts). Newest first.
   */
  reviewActivity?: {
    at: string;
    kind: "verification" | "healing" | "commentary" | "forum" | "review";
    message: string;
    url?: string;
    /** Optional metadata (e.g. AI commentary cost / turns / duration). */
    meta?: { costUsd?: number; turns?: number; durationMs?: number };
  }[];
  /**
   * The raw on-chain proposal as recorded by the NNS, distinct from the
   * proposer's forum write-up. Surfaced near the top so a reviewer sees what
   * was actually submitted to governance.
   */
  onchain: {
    /** Human-readable canister name for the action title, e.g. "Registry". */
    canisterName: string;
    /** Short target commit (e.g. "f2f22") shown in the action title. */
    shortCommit: string;
    /** Verbatim proposal statement extracted from the on-chain body. */
    statement: string;
    /** Link to this proposal on the ICP dashboard. */
    dashboardUrl: string;
    /** Current governance tally / vote state. */
    vote: {
      /** Live disposition based on current voting power. */
      status: "adopt" | "reject" | "open";
      /** Yes / no voting power as a fraction of total (0..1). */
      yes: number;
      no: number;
      /**
       * Adoption threshold as a fraction of total voting power (0..1), as shown
       * on the ICP dashboard. Yes power must cross this line for the proposal to
       * be adopted (the immediate / standard majority marker).
       */
      threshold: number;
    };
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Primary fixture: real proposal #142265 (Registry canister upgrade).
const upgrade: ParsedProposal = {
  proposalId: "142265",
  title: "Upgrade the Registry Canister to Commit 8facd56",
  proposer: "pietro.di.marco at dfinity.org",
  topic: "Protocol Canister Management",
  summaryMarkdown: [
    "This proposal upgrades the **Registry** canister to commit `8facd56`.",
    "",
    "The change extends the set of callers permitted to invoke two subnet-management endpoints, scoping the new caller to CloudEngine subnets.",
  ].join("\n"),
  highlight:
    "The update_subnet and deploy_guestos_to_all_subnet_nodes endpoints can now also be called by the engine-controller canister (si2b5-pyaaa-aaaaa-aaaja-cai) in addition to governance. When invoked by the engine controller, both are restricted to CloudEngine subnets only; calls from governance are unaffected.",
  description: [
    {
      heading: "Features & Fixes",
      markdown: [
        "- **`update_subnet`** can now be called by the engine-controller canister (`si2b5-pyaaa-aaaaa-aaaja-cai`), restricted to CloudEngine subnets.",
        "- **`deploy_guestos_to_all_subnet_nodes`** gains the same engine-controller authorization path, also CloudEngine-only.",
        "- Calls originating from **governance** retain their existing, unrestricted behaviour.",
        "",
        "This removes the need for a per-action NNS proposal when the engine controller manages a CloudEngine subnet.",
      ].join("\n"),
    },
  ],
  repo: { owner: "dfinity", name: "ic", url: "https://github.com/dfinity/ic" },
  forumPostUrl: "https://forum.dfinity.org/t/nns-updates-2026-06-12/52001",
  forum: {
    state: "final",
    url: "https://forum.dfinity.org/t/nns-updates-2026-06-12/52001/8",
  },
  targetCommit: "8facd5635c5e05de9b423b64aeabc2e1ad58d66e",
  previousCommit: "a0f359b3cb39ec8f3f3f576345ba23cb9133e763",
  commits: [
    {
      hash: "8facd5635c",
      subject:
        "feat: allow engine-controller canister to update cloud engines directly (#10431)",
      url: "https://github.com/dfinity/ic/commit/8facd5635c5e05de9b423b64aeabc2e1ad58d66e",
      verified: true,
      added: 40,
      removed: 6,
      review:
        "Adds `engine-controller` (`si2b5-...`) to the caller allow-list for `update_subnet` and `deploy_guestos_to_all_subnet_nodes`, gated to subnets whose type is `CloudEngine`. Governance's existing unrestricted path is untouched. The authorization check reads the subnet record's type before dispatching, so a non-CloudEngine subnet call from the engine controller traps. No state migration.",
    },
  ],
  canisterId: "rwlgt-iiaaa-aaaaa-aaaaa-cai",
  installMode: "upgrade",
  wasmHash: "1 d2c5f8a3b9e07c1a4f6d8b2e0c3a5f7d9b1e4c6a8f0d2b4e6c8a0f2d4b6e8c0a",
  argHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  verification: {
    status: "verified",
    runUrl:
      "https://github.com/jorgenbuilder/gh-verifier/actions/runs/27476493036",
  },
  diff: { added: 40, removed: 6 },
  reviewPostUrl: null,
  commentary: {
    title: "Registry: engine-controller authorization for CloudEngine subnets",
    overallSummary:
      "Adds an authorization path so the **engine-controller** canister can manage CloudEngine subnets without a per-action NNS proposal. Scope is tightly bounded: only `update_subnet` and `deploy_guestos_to_all_subnet_nodes`, only for `CloudEngine`-typed subnets, and governance's behaviour is unchanged.",
    whyNow:
      "CloudEngine subnet operations were previously gated behind individual NNS proposals, which is too slow for the operational cadence the DRE team needs. This delegates a narrow slice of authority to the engine controller.",
    sources: [
      { label: "Proposal body", url: "https://dashboard.internetcomputer.org/proposal/142265" },
      { label: "PR #10431", url: "https://github.com/dfinity/ic/pull/10431" },
      { label: "Forum thread", url: "https://forum.dfinity.org/t/nns-updates-2026-06-12/52001" },
    ],
    confidenceNotes:
      "High confidence on the authorization logic; did not independently verify the CloudEngine subnet-type enum is set correctly on the target subnets.",
    analysisIncomplete: false,
    costUsd: 0.42,
    durationMs: 96000,
    turns: 14,
    generatedAt: "2026-06-12T14:21:00Z",
  },
  reviewActivity: [
    {
      at: "2026-06-12T15:02:00Z",
      kind: "review",
      message: "Final review posted to the forum.",
      url: "https://forum.dfinity.org/t/nns-updates-2026-06-12/52001/8",
    },
    {
      at: "2026-06-12T14:25:00Z",
      kind: "forum",
      message: "Automated verification header posted to the forum thread.",
      url: "https://forum.dfinity.org/t/nns-updates-2026-06-12/52001/4",
    },
    {
      at: "2026-06-12T14:21:00Z",
      kind: "commentary",
      message: "AI commentary generated.",
      meta: { costUsd: 0.42, turns: 14, durationMs: 96000 },
    },
    {
      at: "2026-06-12T14:18:00Z",
      kind: "verification",
      message: "Build verified — WASM hash matches the proposal.",
      url: "https://github.com/jorgenbuilder/gh-verifier/actions/runs/27476493036",
    },
  ],
  onchain: {
    canisterName: "Registry",
    shortCommit: "8facd56",
    statement:
      "Upgrade the Registry canister to commit 8facd5635c5e05de9b423b64aeabc2e1ad58d66e. This change allows the engine-controller canister to call update_subnet and deploy_guestos_to_all_subnet_nodes for CloudEngine subnets, in addition to governance.",
    dashboardUrl: "https://dashboard.internetcomputer.org/proposal/142265",
    vote: { status: "adopt", yes: 0.86, no: 0.04, threshold: 0.5 },
  },
};

// Secondary fixture: a brand-new canister install (legacy NnsCanisterInstall).
const install: ParsedProposal = {
  proposalId: "141980",
  title: "Add NNS canister: engine-controller",
  proposer: "dre-team at dfinity.org",
  topic: "Protocol Canister Management",
  summaryMarkdown: [
    "This proposal **installs a new NNS canister**, `engine-controller`, at canister id `si2b5-pyaaa-aaaaa-aaaja-cai`.",
    "",
    "The canister coordinates CloudEngine subnet lifecycle operations on behalf of the DRE team.",
  ].join("\n"),
  highlight:
    "Installs the engine-controller canister, a new privileged NNS canister that will be granted authorization (in a follow-up Registry upgrade) to manage CloudEngine subnets. On install the canister is inert; it gains no special powers until the Registry recognises it as a caller.",
  description: [
    {
      heading: "Features & Fixes",
      markdown: [
        "- Installs `engine-controller` at `si2b5-pyaaa-aaaaa-aaaja-cai`.",
        "- Controllers set to the NNS root canister.",
        "- No init args beyond the standard canister scaffold.",
      ].join("\n"),
    },
    {
      heading: "Rollout",
      markdown: [
        "The canister ships **inert**. A subsequent Registry upgrade authorizes it as a caller for `update_subnet` and `deploy_guestos_to_all_subnet_nodes`.",
      ].join("\n"),
    },
  ],
  repo: { owner: "dfinity", name: "ic", url: "https://github.com/dfinity/ic" },
  forumPostUrl: "https://forum.dfinity.org/t/nns-updates-2026-06-05/51880",
  forum: {
    state: "draft",
    url: "https://forum.dfinity.org/t/nns-updates-2026-06-05/51880/4",
  },
  targetCommit: "a0f359b3cb39ec8f3f3f576345ba23cb9133e763",
  commits: [
    {
      hash: "a0f359b3cb",
      subject: "feat: add engine-controller canister scaffold (#10402)",
      url: "https://github.com/dfinity/ic/commit/a0f359b3cb39ec8f3f3f576345ba23cb9133e763",
      verified: true,
      added: 540,
      removed: 0,
      review:
        "Introduces the `engine-controller` canister crate: lifecycle endpoints, candid interface, and build wiring. No privileged calls are made on init; the canister is inert until the Registry recognises it as a caller. Worth confirming the init args are empty as claimed.",
    },
    {
      hash: "7c19ab4e02",
      subject: "chore: wire engine-controller into NNS canister registry (#10410)",
      url: "https://github.com/dfinity/ic/commit/7c19ab4e02d4f1a6b8c0e2d4f6a8b0c2e4d6f8a0",
      verified: true,
      added: 72,
      removed: 0,
      review:
        "Registers the new canister id in the NNS canister manifest and adds it to the deploy tooling. Pure plumbing; sets the controller to NNS root.",
    },
  ],
  canisterId: "si2b5-pyaaa-aaaaa-aaaja-cai",
  installMode: "install",
  wasmHash: "9 f3a1c7e5d2b8064a1c3e5d7f9b1a3c5e7d9f1b3a5c7e9d1f3b5a7c9e1d3f5b7a9",
  argHash: null,
  verification: {
    status: "in_progress",
    runUrl:
      "https://github.com/jorgenbuilder/gh-verifier/actions/runs/27460001122",
    healingIteration: 2,
  },
  diff: { added: 612, removed: 0 },
  reviewPostUrl: null,
  commentary: {
    title: "engine-controller: new privileged canister, installed inert",
    overallSummary:
      "Installs a **new privileged NNS canister**. On install it has no special powers; authority is granted later via a Registry upgrade (proposal #142265). Verify the WASM is the minimal scaffold and that the sole controller is NNS root.",
    whyNow:
      "First half of a two-step rollout: ship the canister inert now, grant it scoped authority in a follow-up so the two changes can be reviewed independently.",
    sources: [
      { label: "Proposal body", url: "https://dashboard.internetcomputer.org/proposal/141980" },
      { label: "PR #10402", url: "https://github.com/dfinity/ic/pull/10402" },
    ],
    confidenceNotes:
      "Build verification was still in a self-healing retry at analysis time; treat the WASM-hash claim as provisional until the run goes green.",
    analysisIncomplete: true,
    incompleteReason:
      "Verification run had not completed when commentary was generated (self-healing iteration 2 in progress).",
    costUsd: 0.51,
    durationMs: 132000,
    turns: 19,
    generatedAt: "2026-06-05T09:40:00Z",
  },
  reviewActivity: [
    {
      at: "2026-06-05T09:42:00Z",
      kind: "forum",
      message: "Automated verification header posted (provisional).",
      url: "https://forum.dfinity.org/t/nns-updates-2026-06-05/51880/4",
    },
    {
      at: "2026-06-05T09:40:00Z",
      kind: "commentary",
      message: "AI commentary generated (flagged incomplete).",
      meta: { costUsd: 0.51, turns: 19, durationMs: 132000 },
    },
    {
      at: "2026-06-05T09:35:00Z",
      kind: "healing",
      message: "Self-healing iteration 2 started after build failure.",
      url: "https://github.com/jorgenbuilder/gh-verifier/actions/runs/27460001122",
    },
    {
      at: "2026-06-05T09:28:00Z",
      kind: "verification",
      message: "Initial build failed; auto-fix triggered.",
    },
  ],
  onchain: {
    canisterName: "engine-controller",
    shortCommit: "a0f359b",
    statement:
      "Add a new NNS-controlled canister, engine-controller, at canister id si2b5-pyaaa-aaaaa-aaaja-cai, installed from commit a0f359b3cb39ec8f3f3f576345ba23cb9133e763. The canister is installed inert with the NNS root canister as its sole controller.",
    dashboardUrl: "https://dashboard.internetcomputer.org/proposal/141980",
    vote: { status: "open", yes: 0.41, no: 0.12, threshold: 0.5 },
  },
};

// Tertiary fixture: a legacy proposal with no arg hash and an embedded-wasm
// commit link that the verifier could not match against a real commit.
const legacy: ParsedProposal = {
  proposalId: "98213",
  title: "Upgrade SNS-W (SNS Wasm Modules) canister",
  proposer: "unknown",
  topic: "Service Nervous System Management",
  summaryMarkdown: [
    "Legacy `ExecuteNnsFunction` proposal. The WASM was embedded directly in the proposal payload rather than referenced by commit.",
    "",
    "_No machine-readable arg hash was supplied._",
  ].join("\n"),
  highlight:
    "Upgrades the SNS-W canister using a WASM blob embedded in the proposal. Because the payload carries no commit reference or arg hash, the build cannot be reproduced from source automatically; the commit shown was derived by hashing the embedded WASM and is unverified.",
  description: [
    {
      heading: "Features & Fixes",
      markdown:
        "No structured Features & Fixes section was present in the original proposal text. Review the diff and the embedded WASM directly.",
    },
  ],
  repo: { owner: "dfinity", name: "ic", url: "https://github.com/dfinity/ic" },
  forumPostUrl: "https://forum.dfinity.org/t/nns-updates-legacy/12345",
  forum: { state: "none", url: null },
  targetCommit: "3f1b9d2a",
  commits: [
    {
      hash: "3f1b9d2a",
      subject: "(derived from embedded WASM — commit not confirmed)",
      url: "https://github.com/dfinity/ic/commit/3f1b9d2a",
      verified: false,
    },
  ],
  canisterId: "qaa6y-5yaaa-aaaaa-aaafa-cai",
  installMode: "upgrade",
  wasmHash: "4 a7c2e9f1b3d5860a2c4e6f8b0d2a4c6e8f0b2d4a6c8e0f2b4d6a8c0e2f4b6d8a0",
  argHash: null,
  verification: { status: "failed", runUrl: undefined },
  diff: undefined,
  reviewPostUrl:
    "https://forum.dfinity.org/t/nns-updates-legacy/12345/7",
  commentary: null,
  reviewActivity: [
    {
      at: "2024-03-02T11:10:00Z",
      kind: "review",
      message: "Manual review posted (build not reproducible).",
      url: "https://forum.dfinity.org/t/nns-updates-legacy/12345/7",
    },
    {
      at: "2024-03-02T10:55:00Z",
      kind: "verification",
      message: "Verification failed: embedded WASM has no source commit to reproduce.",
    },
  ],
  onchain: {
    canisterName: "SNS-W",
    shortCommit: "3f1b9d2",
    statement:
      "Upgrade the SNS-W canister using a WASM module embedded directly in the proposal payload. No source commit or argument hash was supplied with the on-chain proposal.",
    dashboardUrl: "https://dashboard.internetcomputer.org/proposal/98213",
    vote: { status: "reject", yes: 0.18, no: 0.55, threshold: 0.5 },
  },
};

export const stubProposals = { upgrade, install, legacy } as const;

export type StubVariant = keyof typeof stubProposals;

export const stubVariants = Object.keys(stubProposals) as StubVariant[];

export function getStubProposal(variant: string | undefined): ParsedProposal {
  if (variant && variant in stubProposals) {
    return stubProposals[variant as StubVariant];
  }
  return stubProposals.upgrade;
}

// ---------------------------------------------------------------------------
// Parser notes (what the real pipeline must produce to feed this view)
// ---------------------------------------------------------------------------
//
// - highlight / description[]: parsed out of the proposer's markdown summary.
//   The NNS proposal `summary` field is free-form markdown. A parser should
//   pull the lead paragraph as `highlight` and split on `##`/`**Heading**`
//   boundaries to populate `description[]` (Features & Fixes, Rollout, etc.).
// - commits[].verified: each commit's reproducibility status. For modern
//   InstallCode proposals this is per-commit from the verifier; for legacy
//   embedded-WASM proposals there is no real commit, so derive a pseudo-hash
//   and set verified:false (see the "legacy" fixture).
// - verification: maps directly from the gh-verifier run conclusion
//   (success -> verified, failure -> failed, in_progress -> in_progress,
//   no run yet -> pending).
// - diff: from getProposalDiffStats; may be absent for legacy proposals.
// - argHash: null when the proposal carries no install arg (e.g. installs
//   with empty args, or legacy proposals).
