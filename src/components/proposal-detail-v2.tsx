"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import {
  ChevronDown,
  Check,
  Copy,
  Github,
  Home,
  Link as LinkIcon,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  MessageSquare,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParsedProposal } from "@/lib/design-stub";

// Icon per review-activity kind.
const ACTIVITY_ICON: Record<
  NonNullable<ParsedProposal["reviewActivity"]>[number]["kind"],
  typeof ShieldCheck
> = {
  verification: ShieldCheck,
  healing: RefreshCw,
  commentary: Sparkles,
  forum: MessageSquare,
  review: FileCheck,
};

// Proposal number + copy-link control. Clicking the number or the icon copies
// the current page URL; the icon is briefly replaced by a tiny "copied" label
// that fades out fast.
function CopyPageLink({ proposalId }: { proposalId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 900);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy link to this proposal"
        className="text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        aria-current="page"
      >
        #{proposalId}
      </button>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Link copied" : "Copy link to this proposal"}
        className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </span>
  );
}

// Pure presentational redesign of the proposal detail view.
//
// Mobile-first, edge-to-edge, no rounded corners, hairline dividers between
// sections. Renders entirely from a `ParsedProposal` prop — no data fetching.

interface ProposalDetailV2Props {
  proposal: ParsedProposal;
}

// --- Dense markdown renderer (tight spacing, no rounded corners) -----------

const mdComponents: Components = {
  a: ({ node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
    />
  ),
  p: ({ node, ...props }) => (
    <p className="my-2 leading-relaxed first:mt-0 last:mb-0" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="my-2 space-y-1 pl-4 list-disc marker:text-muted-foreground" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="my-2 space-y-1 pl-4 list-decimal marker:text-muted-foreground" {...props} />
  ),
  li: ({ node, ...props }) => <li className="leading-relaxed pl-1" {...props} />,
  code: ({ node, className, children, ...props }) => (
    <code
      className="rounded-none border border-border bg-muted px-1 py-0.5 font-mono text-[0.85em] break-words"
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ node, ...props }) => (
    <pre
      className="my-2 overflow-x-auto border border-border bg-muted p-2 font-mono text-[0.75rem] leading-snug [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  h1: ({ node, ...props }) => <h3 className="mt-3 mb-1 text-sm font-semibold" {...props} />,
  h2: ({ node, ...props }) => <h3 className="mt-3 mb-1 text-sm font-semibold" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mt-3 mb-1 text-sm font-semibold" {...props} />,
  hr: ({ node, ...props }) => <hr className="my-3 border-border" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
};

function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm text-foreground", className)}>
      <ReactMarkdown components={mdComponents}>{children}</ReactMarkdown>
    </div>
  );
}

// --- Collapsible section header (caret on the left, unified typography) -----

function CollapsibleHeader({
  open,
  onToggle,
  children,
  trailing,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** Optional element rendered flush to the right edge (e.g. a link icon). */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90"
          )}
          aria-hidden
        />
        <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium text-foreground">
          {children}
        </span>
      </button>
      {trailing}
    </div>
  );
}

// --- Header icon button (small square, no rounded corners) -----------------

function IconButton({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </a>
  );
}

// --- Forum button (four lifecycle states) ----------------------------------
//
// The forum button keeps the speech-bubble shape constant across states and
// carries the state in the bubble's fill colour, reusing the existing status
// palette:
//   none        -> faded outline (nothing discovered yet)
//   discovered  -> plain outline (official DFINITY post found)
//   draft       -> solid yellow (our post is up but only the automated
//                  verification header — provisional)
//   final       -> solid green, matching the verification status blip (our
//                  full review posted)
//
// Clicking cycles through the states locally so every appearance is testable
// without real forum data.

type ForumState = ParsedProposal["forum"]["state"];

const FORUM_LABEL: Record<ForumState, string> = {
  none: "Searching for forum post…",
  discovered: "Forum post discovered — open it",
  draft: "Review posted (automated verification only) — open it",
  final: "Final review posted — open it",
};

function ForumGlyph({ state }: { state: ForumState }) {
  // Bespoke hard-edged speech bubble (no rounded corners, large tail). The
  // bubble shape is constant; the fill colour carries the state:
  //   none        -> faded outline (nothing discovered yet)
  //   discovered  -> plain outline
  //   draft       -> solid yellow, no outline (automated verification only)
  //   final       -> solid green (matches status blip), no outline (review posted)
  const filled = state === "draft" || state === "final";
  const styles: Record<ForumState, string> = {
    none: "text-muted-foreground/40",
    discovered: "text-muted-foreground",
    draft: "text-amber-400",
    final: "text-emerald-500",
  };
  // Square body with the bottom-left corner kept at x=3; a short triangular
  // tail drops from just right of that corner, leaving a horizontal segment of
  // bottom edge to its left. viewBox 0..24.
  const path = "M3 4 H21 V16 H11 L6 20 V16 H3 Z";
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-5 w-5", styles[state])}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.6}
      strokeLinejoin="miter"
      strokeLinecap="butt"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

function ForumButton({ forum }: { forum: ParsedProposal["forum"] }) {
  const label = FORUM_LABEL[forum.state];
  const cls =
    "inline-flex h-9 w-9 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
  // Real link when there's a post to open; static cell for "none".
  if (forum.url) {
    return (
      <a href={forum.url} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={cls}>
        <ForumGlyph state={forum.state} />
      </a>
    );
  }
  return (
    <span role="img" aria-label={label} title={label} className={cn(cls, "cursor-default")}>
      <ForumGlyph state={forum.state} />
    </span>
  );
}

// --- Verification status blip ----------------------------------------------
//
// A compact status dot rendered on the proposal-number row:
//   verified    -> solid green dot
//   pending     -> spinning loader ring
//   in_progress -> spinning loader ring; if a self-healing iteration is
//                  running, an orange circle with the iteration number sits
//                  inside the spinner
//   failed      -> solid red dot
//
// Clicking the blip rotates through the states locally so the owner can test
// every appearance without real verifier data. The rotation cycle is:
//   pending -> verified -> failed -> healing #1 -> #2 -> #3 -> (back to pending)

const BLIP_LABEL: Record<ParsedProposal["verification"]["status"], string> = {
  pending: "Verification pending",
  verified: "Build verified",
  failed: "Verification failed",
  in_progress: "Verifying",
};

function Spinner() {
  return (
    <span
      className="block h-full w-full animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
      aria-hidden
    />
  );
}

function StatusBlip({
  verification,
}: {
  verification: ParsedProposal["verification"];
}) {
  const status = verification.status;
  const healing = status === "in_progress" && verification.healingIteration !== undefined;
  const label = healing
    ? `Self-healing, iteration ${verification.healingIteration}`
    : BLIP_LABEL[status];

  const inner = (
    <>
      {status === "verified" && (
        <span className="block h-3 w-3 rounded-full bg-emerald-500" aria-hidden />
      )}
      {status === "failed" && (
        <span className="block h-3 w-3 rounded-full bg-destructive" aria-hidden />
      )}
      {(status === "pending" || status === "in_progress") && (
        <span className="relative block h-5 w-5">
          <Spinner />
          {healing && (
            <span
              className="absolute inset-0 m-auto flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[0.55rem] font-bold leading-none text-white"
              aria-hidden
            >
              {verification.healingIteration}
            </span>
          )}
        </span>
      )}
    </>
  );

  const base = "relative inline-flex h-9 w-9 items-center justify-center";
  // Link to the verification run when we have one; static cell otherwise.
  if (verification.runUrl) {
    return (
      <a
        href={verification.runUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className={cn(base, "hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}
      >
        {inner}
      </a>
    );
  }
  return (
    <span role="img" aria-label={label} title={label} className={base}>
      {inner}
    </span>
  );
}

// --- Vote / governance tally indicator -------------------------------------

const VOTE_META: Record<
  ParsedProposal["onchain"]["vote"]["status"],
  { label: string; dot: string; text: string }
> = {
  adopt: {
    label: "Adopt",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  reject: {
    label: "Reject",
    dot: "bg-destructive",
    text: "text-destructive",
  },
  open: {
    label: "Open",
    dot: "bg-amber-400",
    text: "text-amber-500",
  },
};

function VoteIndicator({ vote }: { vote: ParsedProposal["onchain"]["vote"] }) {
  const meta = VOTE_META[vote.status];
  const yesPct = Math.round(vote.yes * 100);
  const noPct = Math.round(vote.no * 100);
  const thresholdPct = Math.round(vote.threshold * 100);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className={cn("flex items-center gap-1.5 text-sm font-semibold", meta.text)}>
          <span className={cn("h-2 w-2", meta.dot)} aria-hidden />
          {meta.label}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {yesPct}% yes &middot; {noPct}% no
        </span>
      </div>
      {/* ICP-dashboard-style tally bar: yes anchored left (grows right), no
          anchored right (grows left), undecided in the middle, with a vertical
          adoption-threshold marker. */}
      <div className="relative mt-2 h-2.5 w-full bg-muted" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 bg-emerald-500"
          style={{ width: `${yesPct}%` }}
        />
        <span
          className="absolute inset-y-0 right-0 bg-destructive"
          style={{ width: `${noPct}%` }}
        />
        {/* Adoption threshold marker */}
        <span
          className="absolute inset-y-[-2px] w-px bg-foreground"
          style={{ left: `${thresholdPct}%` }}
        />
      </div>
      <div className="relative mt-1 h-3">
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[0.65rem] tabular-nums text-muted-foreground"
          style={{ left: `${thresholdPct}%` }}
        >
          {thresholdPct}% threshold
        </span>
      </div>
    </div>
  );
}

// --- Main component --------------------------------------------------------

export function ProposalDetailV2({ proposal: p }: ProposalDetailV2Props) {
  const [commentaryOpen, setCommentaryOpen] = useState(false);
  const [onchainOpen, setOnchainOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [openCommits, setOpenCommits] = useState<Record<string, boolean>>({});
  const toggleCommit = (hash: string) =>
    setOpenCommits((m) => ({ ...m, [hash]: !m[hash] }));

  return (
    <article className="mx-auto w-full max-w-2xl bg-background text-foreground">
      {/* 1. Header */}
      <header>
        {/* Full-bleed segmented control bar: proposal number on the left, a
            flush row of buttons on the right sharing one edge-to-edge bottom
            border with vertical dividers between them. Status indicator is the
            leftmost button. */}
        <div className="sticky top-0 z-20 flex items-stretch border-y border-border bg-background">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 pl-3 pr-3 font-mono text-xs text-muted-foreground">
            <Link
              href="/"
              aria-label="Back to proposals"
              className="inline-flex items-center text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Home className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <span className="text-muted-foreground/60" aria-hidden>/</span>
            <CopyPageLink proposalId={p.proposalId} />
          </nav>
          {p.diff && (
            <span className="ml-auto flex items-center gap-2 pr-3 font-mono text-xs font-bold tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">+{p.diff.added}</span>
              <span className="text-destructive">&minus;{p.diff.removed}</span>
            </span>
          )}
          <div className={cn("flex items-stretch border-l border-border", !p.diff && "ml-auto")}>
            <StatusBlip verification={p.verification} />
            {p.repo.url && (
              <IconButton href={p.repo.url} label="View repository on GitHub">
                <Github className="h-5 w-5" strokeWidth={1.6} aria-hidden />
              </IconButton>
            )}
            <ForumButton forum={p.forum} />
          </div>
        </div>
      </header>

      {/* 1b. On-chain proposal — what was actually submitted to governance.
          Collapsible; the heading is replaced by a caret + action title, with
          an external link to the ICP dashboard. */}
      <section className="border-b border-border">
        <CollapsibleHeader
          open={onchainOpen}
          onToggle={() => setOnchainOpen((o) => !o)}
          trailing={
            <a
              href={p.onchain.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View proposal on the ICP dashboard"
              title="View on ICP dashboard"
              className="flex w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <LinkIcon className="h-4 w-4" aria-hidden />
            </a>
          }
        >
          <span className="min-w-0 truncate">
            {p.installMode && <span className="capitalize">{p.installMode} </span>}
            {p.onchain.canisterName}{" "}
            <span className="font-mono text-[0.8em] font-bold text-muted-foreground/60">
              {p.onchain.shortCommit}
            </span>
          </span>
        </CollapsibleHeader>
        {onchainOpen && (
          <div className="px-3 pb-4">
            <Markdown className="text-muted-foreground">{p.onchain.statement}</Markdown>
            <p className="mt-2 font-mono text-xs text-muted-foreground">{p.proposer}</p>
            <div className="mt-3">
              <VoteIndicator vote={p.onchain.vote} />
            </div>
          </div>
        )}
      </section>

      {/* 2. Commits — flat rows, direct children, no wrapper/heading. Closed row
          shows just the hash; opening reveals the subject + per-commit AI
          review. */}
      {p.commits.map((c) => {
        const open = !!openCommits[c.hash];
        const hasReview = !!c.review;
        return (
          <div key={c.hash} className="border-b border-border">
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={() => hasReview && toggleCommit(c.hash)}
                aria-expanded={hasReview ? open : undefined}
                disabled={!hasReview}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 py-2.5 pl-3 pr-2 text-left",
                  hasReview
                    ? "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    : "cursor-default"
                )}
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                    !open && "-rotate-90",
                    !hasReview && "invisible"
                  )}
                  aria-hidden
                />
                <span className="font-mono text-sm text-foreground">{c.hash}</span>
                {(c.added !== undefined || c.removed !== undefined) && (
                  <span className="font-mono text-[0.7rem] font-bold tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">+{c.added ?? 0}</span>{" "}
                    <span className="text-destructive">&minus;{c.removed ?? 0}</span>
                  </span>
                )}
                <span className="ml-auto shrink-0">
                  {c.verified ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <span className="font-mono text-[0.7rem] text-amber-600 dark:text-amber-400">
                      unverified
                    </span>
                  )}
                </span>
              </button>
              {/* Link to the commit on GitHub */}
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open commit ${c.hash} on GitHub`}
                title="Open commit on GitHub"
                className="flex w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <LinkIcon className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
            {hasReview && open && (
              <div className="px-3 pb-3 pl-[1.375rem]">
                <p className="text-sm font-medium leading-snug text-foreground">{c.subject}</p>
                <Markdown className="mt-1 text-muted-foreground">{c.review!}</Markdown>
              </div>
            )}
          </div>
        );
      })}

      {/* 3. AI commentary — tight + collapsible, same content as the live
          widget (overall summary, why-now, sources, confidence, incomplete
          warning, generation metadata). */}
      {p.commentary && (
        <section className="border-b border-border">
          <CollapsibleHeader open={commentaryOpen} onToggle={() => setCommentaryOpen((o) => !o)}>
            AI commentary
            {p.commentary.analysisIncomplete && (
              <span className="inline-flex items-center gap-1 border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden /> Incomplete
              </span>
            )}
          </CollapsibleHeader>
          {commentaryOpen && (
            <div className="space-y-3 px-3 pb-4">
              <p className="text-sm font-semibold leading-snug text-foreground">
                {p.commentary.title}
              </p>

              {p.commentary.analysisIncomplete && p.commentary.incompleteReason && (
                <p className="border-l-2 border-amber-500/60 bg-amber-500/5 py-1.5 pl-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                  {p.commentary.incompleteReason}
                </p>
              )}

              <Markdown className="text-muted-foreground">
                {p.commentary.overallSummary}
              </Markdown>

              {p.commentary.whyNow && (
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                    Why now
                  </p>
                  <Markdown className="mt-1 text-muted-foreground">{p.commentary.whyNow}</Markdown>
                </div>
              )}

              {p.commentary.confidenceNotes && (
                <p className="text-xs italic leading-relaxed text-muted-foreground">
                  {p.commentary.confidenceNotes}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* 4. Review activity log — collapsible chronological feed */}
      {p.reviewActivity && p.reviewActivity.length > 0 && (
        <section className="border-b border-border">
          <CollapsibleHeader open={activityOpen} onToggle={() => setActivityOpen((o) => !o)}>
            Review activity
            <span className="font-normal text-muted-foreground/60">{p.reviewActivity.length}</span>
          </CollapsibleHeader>
          {activityOpen && (
            <ol className="px-3 pb-4">
              {p.reviewActivity.map((ev, i) => {
                const Icon = ACTIVITY_ICON[ev.kind];
                return (
                  <li key={i} className="flex gap-2 py-1.5">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-foreground">
                        {ev.url ? (
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
                          >
                            {ev.message}
                          </a>
                        ) : (
                          ev.message
                        )}
                      </p>
                      <p className="flex flex-wrap gap-x-3 font-mono text-[0.65rem] text-muted-foreground">
                        <span>{new Date(ev.at).toLocaleString()}</span>
                        {ev.meta?.turns !== undefined && <span>{ev.meta.turns} turns</span>}
                        {ev.meta?.durationMs !== undefined && (
                          <span>{Math.round(ev.meta.durationMs / 1000)}s</span>
                        )}
                        {ev.meta?.costUsd !== undefined && (
                          <span>${ev.meta.costUsd.toFixed(2)}</span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      )}

      {/* 5. Sources — collapsible */}
      {p.commentary?.sources && p.commentary.sources.length > 0 && (
        <section className="border-b border-border">
          <CollapsibleHeader open={sourcesOpen} onToggle={() => setSourcesOpen((o) => !o)}>
            Sources
            <span className="font-normal text-muted-foreground/60">
              {p.commentary.sources.length}
            </span>
          </CollapsibleHeader>
          {sourcesOpen && (
            <ul className="space-y-1 px-3 pb-4 text-sm">
              {p.commentary.sources.map((s) =>
                s.url ? (
                  <li key={s.label}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
                    >
                      <LinkIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {s.label}
                    </a>
                  </li>
                ) : (
                  <li key={s.label} className="flex items-center gap-1.5 text-muted-foreground">
                    <LinkIcon className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                    {s.label}
                  </li>
                )
              )}
            </ul>
          )}
        </section>
      )}

    </article>
  );
}
