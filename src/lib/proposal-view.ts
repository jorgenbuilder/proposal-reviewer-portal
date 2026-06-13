// Assembles the real ParsedProposal that feeds the detail UI (ProposalDetailV2), combining:
//   - on-chain proposal (getProposal): title, summary, canister/install-mode/hashes, topic
//   - deterministic body parse: proposer, repo, commits (repo-aware links), description
//   - live vote tally (IC dashboard API)
//   - verification status (+ self-healing iteration from the event log)
//   - AI commentary, diff stats, forum/review state, and the per-proposal activity log
// Server-only (touches the DB + IC agent). Per-commit `verified` is false until the git
// commit-verification ships; the wasm/build is still verified via verification.status.
import "server-only";
import type { ParsedProposal } from "./design-stub";
import { getProposal, TOPIC_NAMES } from "./nns";
import { parseProposalSummary, commitUrl } from "./parse-proposal";
import { getProposalVote } from "./proposal-vote";
import { getVerificationStatusForProposals, getMultipleCommitStats, getDashboardUrl } from "./github";
import {
  getLatestCommentary,
  getProposalDiffStats,
  getProposalEvents,
  getReviewPostState,
  type ProposalEvent,
} from "./db";

const INSTALL_MODE: Record<number, string> = { 1: "install", 2: "reinstall", 3: "upgrade" };

function deriveCanisterName(title: string, canisterId: string | null): string {
  const m = title.match(/(?:upgrade|install|add)\s+(?:the\s+|nns\s+canister:\s*)?(.+?)\s+canister/i) ||
    title.match(/nns\s+canister:\s*([a-z0-9-]+)/i);
  if (m) return m[1].replace(/\b\w/g, (c) => c.toUpperCase());
  return canisterId ? canisterId.split("-")[0] : "Canister";
}

const firstParagraph = (md: string | null): string =>
  (md || "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/, "").trim())
    .find((p) => p.length > 0) || "";

type ActivityKind = "verification" | "healing" | "commentary" | "forum" | "review";
function activityKind(t: string): ActivityKind {
  if (t.startsWith("verification_healing") || t === "verification_gave_up") return "healing";
  if (t.startsWith("verification")) return "verification";
  if (t === "commentary_generated") return "commentary";
  if (t === "canonical_found") return "forum";
  return "review";
}

const ACTIVITY_LABEL: Record<string, string> = {
  proposal_detected: "Proposal detected",
  verification_started: "Verification started",
  verification_verified: "Build verified",
  verification_failed: "Verification failed",
  verification_gave_up: "Self-healing gave up",
  commentary_generated: "AI commentary generated",
  canonical_found: "Canonical forum post found",
  review_posted: "Verification note posted",
  review_flagged: "Verification flagged",
};

function activityMessage(e: ProposalEvent): string {
  if (e.event_type === "verification_healing") {
    const n = e.detail?.match(/\d+/)?.[0];
    return n ? `Self-healing iteration #${n}` : "Self-healing in progress";
  }
  return ACTIVITY_LABEL[e.event_type] || e.event_type;
}

export async function buildParsedProposal(id: string): Promise<ParsedProposal | null> {
  const proposal = await getProposal(BigInt(id));
  if (!proposal) return null;

  const parse = parseProposalSummary(proposal.summary);
  const [vstatusMap, vote, commentary, diff, reviewState, events] = await Promise.all([
    getVerificationStatusForProposals([id]),
    getProposalVote(id),
    getLatestCommentary(id),
    getProposalDiffStats(id),
    getReviewPostState(id),
    getProposalEvents({ proposalId: id, limit: 50 }),
  ]);

  // Per-commit stats + AI review summaries.
  const commitStats = await getMultipleCommitStats(parse.commits.map((c) => c.hash)).catch(() => new Map());
  const summaryByHash = new Map(
    (commentary?.commit_summaries || []).map((c) => [c.commit_hash, c])
  );
  const commits = parse.commits.map((c) => {
    const cs = summaryByHash.get(c.hash) || [...summaryByHash.entries()].find(([h]) => h.startsWith(c.hash) || c.hash.startsWith(h))?.[1];
    const stats = commitStats.get(c.hash);
    return {
      hash: c.hash,
      subject: c.subject,
      url: commitUrl(parse.repo, c.hash) || (parse.repo ? parse.repo.url : "#"),
      verified: false, // until commit-level git verification ships
      review: cs?.summary,
      added: stats?.additions ?? cs?.additions,
      removed: stats?.deletions ?? cs?.deletions,
    };
  });

  const vstatus = vstatusMap.get(id);
  const latestHealing = events.find((e) => e.event_type === "verification_healing");
  const healingIteration = vstatus?.status === "in_progress" && latestHealing?.detail
    ? Number(latestHealing.detail.match(/\d+/)?.[0]) || undefined
    : undefined;

  const reviewPostedEvent = events.find((e) => e.event_type === "review_posted");
  const forumState: ParsedProposal["forum"]["state"] =
    reviewState.state === "posted" ? "draft" : reviewState.canonicalForumUrl ? "discovered" : "none";

  const repo = parse.repo ?? { owner: "", name: "", url: "" };
  const targetCommit = parse.targetCommit || proposal.commitHash || "";

  return {
    proposalId: id,
    title: proposal.title,
    proposer: parse.proposer || "—",
    topic: TOPIC_NAMES[proposal.topic] || `Topic ${proposal.topic}`,
    summaryMarkdown: proposal.summary,
    description: parse.description,
    highlight: firstParagraph(parse.features),
    repo,
    forumPostUrl: reviewState.canonicalForumUrl,
    forum: {
      state: forumState,
      url: reviewState.canonicalForumUrl ?? undefined,
    },
    targetCommit,
    previousCommit: parse.previousCommit ?? undefined,
    commits,
    canisterId: proposal.canisterId ?? undefined,
    installMode: proposal.installMode != null ? INSTALL_MODE[proposal.installMode] : undefined,
    wasmHash: proposal.expectedWasmHash ?? undefined,
    argHash: proposal.expectedArgHash,
    verification: {
      status: vstatus?.status ?? "pending",
      runUrl: vstatus?.runUrl ?? undefined,
      healingIteration,
    },
    diff: diff && (diff.linesAdded != null || diff.linesRemoved != null)
      ? { added: diff.linesAdded ?? 0, removed: diff.linesRemoved ?? 0 }
      : undefined,
    reviewPostUrl: reviewPostedEvent?.detail ?? null,
    commentary: commentary
      ? {
          title: commentary.title,
          overallSummary: commentary.overall_summary,
          whyNow: commentary.why_now,
          sources: (commentary.sources || []).map((s) => ({ label: s.description, url: s.url })),
          confidenceNotes: commentary.confidence_notes,
          analysisIncomplete: commentary.analysis_incomplete,
          incompleteReason: commentary.incomplete_reason,
          costUsd: commentary.cost_usd,
          durationMs: commentary.duration_ms,
          turns: commentary.turns,
          generatedAt: commentary.created_at,
        }
      : null,
    reviewActivity: events.map((e) => ({
      at: e.created_at,
      kind: activityKind(e.event_type),
      message: activityMessage(e),
      url: e.detail && /^https?:\/\//.test(e.detail) ? e.detail : undefined,
    })),
    onchain: {
      canisterName: deriveCanisterName(proposal.title, proposal.canisterId),
      shortCommit: targetCommit.slice(0, 7),
      statement: proposal.summary,
      dashboardUrl: getDashboardUrl(id),
      vote: vote ?? { status: "open", yes: 0, no: 0, threshold: 0.5 },
    },
  };
}
