"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RotateCw, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsMenu } from "@/components/settings-menu";
import { HubStatus, type HubStatusValue } from "@/components/hub-status";
import type { VerificationStatus } from "@/lib/github";

interface Proposal {
  id: string;
  title: string;
  topic: string;
  verificationStatus: VerificationStatus;
  viewerSeenAt: string | null;
  reviewForumUrl: string | null;
  reviewedAt: string | null;
  commentaryTitle: string | null;
  proposalTimestamp: string | null;
  linesAdded: number | null;
  linesRemoved: number | null;
  hub: HubStatusValue | null;
}

async function fetchProposals(): Promise<Proposal[]> {
  const res = await fetch("/api/proposals");
  if (!res.ok) throw new Error("Failed to fetch proposals");
  const data = await res.json();
  return data.proposals || [];
}

// Verification status as a small colored dot, matching the detail page's blip.
const VERIFY_DOT: Record<VerificationStatus, { color: string; pulse: boolean; label: string }> = {
  verified: { color: "bg-emerald-500", pulse: false, label: "Build verified" },
  failed: { color: "bg-destructive", pulse: false, label: "Verification failed" },
  in_progress: { color: "bg-amber-500", pulse: true, label: "Verifying" },
  pending: { color: "bg-muted-foreground/40", pulse: true, label: "Verification pending" },
};

function VerifyDot({ status }: { status: VerificationStatus }) {
  const { color, pulse, label } = VERIFY_DOT[status];
  return (
    <span className="flex items-center" title={label} aria-label={label}>
      <span className={cn("h-2 w-2 rounded-full", color, pulse && "animate-pulse")} />
    </span>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ProposalRow({ p }: { p: Proposal }) {
  const unseen = !p.viewerSeenAt;
  return (
    <Link
      href={`/proposals/${p.id}`}
      className="block border-b border-border px-3 py-3 transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {/* Top line: id (+ new dot), then hub status + verification + chevron. */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
          #{p.id}
        </span>
        {unseen && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500"
            title="New — not yet viewed"
            aria-label="New"
          />
        )}
        {p.reviewForumUrl && (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            aria-label="Reviewed"
          />
        )}
        <span className="ml-auto flex items-center gap-2">
          {p.hub && <HubStatus hub={p.hub} />}
          <VerifyDot status={p.verificationStatus} />
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
        </span>
      </div>

      {/* Title. */}
      <p className="mt-1 line-clamp-2 break-words text-[15px] font-medium leading-snug text-foreground">
        {p.title}
      </p>

      {/* AI commentary one-liner, if present. */}
      {p.commentaryTitle && (
        <p className="mt-0.5 line-clamp-1 break-words text-xs italic text-muted-foreground/80">
          {p.commentaryTitle}
        </p>
      )}

      {/* Meta line: topic · time, diff stats on the right. */}
      <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[0.7rem] text-muted-foreground">
        <span className="truncate">{p.topic}</span>
        {p.proposalTimestamp && (
          <>
            <span className="text-muted-foreground/40" aria-hidden>·</span>
            <span className="shrink-0">{relativeTime(p.proposalTimestamp)}</span>
          </>
        )}
        {(p.linesAdded != null || p.linesRemoved != null) && (
          <span className="ml-auto shrink-0 font-bold tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">+{p.linesAdded ?? 0}</span>{" "}
            <span className="text-destructive">&minus;{p.linesRemoved ?? 0}</span>
          </span>
        )}
      </div>
    </Link>
  );
}

export function ProposalListV2() {
  const {
    data: proposals = [],
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["proposals"],
    queryFn: fetchProposals,
    refetchInterval: 60 * 1000,
  });

  const [topicFilter, setTopicFilter] = useState<string>("all");

  const topics = useMemo(
    () => Array.from(new Set(proposals.map((p) => p.topic))).sort(),
    [proposals]
  );
  const filtered = useMemo(
    () => (topicFilter === "all" ? proposals : proposals.filter((p) => p.topic === topicFilter)),
    [proposals, topicFilter]
  );

  return (
    <div className="min-h-screen bg-background">
      <article className="mx-auto w-full max-w-2xl overflow-x-clip bg-background pb-[40vh] text-foreground">
        {/* Fixed top bar — mirrors the detail page: spacer reserves height, bar
            is fixed and centred on the same column. */}
        <header className="h-[38px]">
          <div className="fixed left-1/2 top-0 z-30 flex w-full max-w-2xl -translate-x-1/2 items-stretch border-y border-border bg-background">
            <div className="flex min-w-0 flex-1 items-center gap-2 pl-3 font-mono text-xs">
              <span className="font-bold uppercase tracking-wide text-foreground">Proposals</span>
              <span className="text-muted-foreground/60">{proposals.length}</span>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Refresh proposals"
              title="Refresh"
              className="flex w-9 shrink-0 items-center justify-center border-l border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              <RotateCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden />
            </button>
            <div className="flex items-stretch border-l border-border">
              <SettingsMenu triggerClassName="h-full w-9 rounded-none px-0 hover:bg-muted" />
            </div>
          </div>
        </header>

        {/* Topic filter — sticky just below the bar. Horizontal scroll is
            intentional here (a chip rail), not page overflow. */}
        {topics.length > 0 && (
          <div className="sticky top-[38px] z-20 flex gap-1.5 overflow-x-auto border-b border-border bg-background px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterChip active={topicFilter === "all"} onClick={() => setTopicFilter("all")}>
              All
            </FilterChip>
            {topics.map((t) => (
              <FilterChip key={t} active={topicFilter === t} onClick={() => setTopicFilter(t)}>
                {t}
              </FilterChip>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="px-3 py-16 text-center text-sm text-muted-foreground">
            <span className="animate-pulse">Loading proposals…</span>
          </div>
        ) : error ? (
          <div className="px-3 py-16 text-center text-sm text-destructive">
            Failed to load proposals. Pull to refresh.
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-16 text-center text-sm text-muted-foreground">
            {topicFilter === "all"
              ? "No proposals yet. You'll be notified when new ones appear."
              : "No proposals for this topic."}
          </div>
        ) : (
          filtered.map((p) => <ProposalRow key={p.id} p={p} />)
        )}
      </article>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap border px-2 py-0.5 font-mono text-[0.7rem] transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
