"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// Review-hub status, read from the NNS Technical Review Hub canister. Terminal
// states are literal words ("done"/"miss"); a pending review counts down to the
// on-chain review deadline. Shared by the detail top bar and the list rows.
export type HubStatusValue =
  | { state: "done" }
  | { state: "miss" }
  | { state: "pending"; deadlineMs: number };

export function HubStatus({
  hub,
  className,
}: {
  hub: HubStatusValue;
  className?: string;
}) {
  if (hub.state === "done")
    return (
      <span
        className={cn(
          "font-mono text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400",
          className
        )}
      >
        done
      </span>
    );
  if (hub.state === "miss")
    return (
      <span
        className={cn(
          "font-mono text-xs font-bold uppercase tracking-wide text-destructive",
          className
        )}
      >
        miss
      </span>
    );
  return <HubCountdown deadlineMs={hub.deadlineMs} className={className} />;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "due";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// `remaining` starts null so server and first client render match (just the
// clock icon); the interval fills it in on mount and ticks every second.
function HubCountdown({
  deadlineMs,
  className,
}: {
  deadlineMs: number;
  className?: string;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setRemaining(deadlineMs - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadlineMs]);
  const overdue = remaining !== null && remaining <= 0;
  return (
    <span
      title={
        remaining === null
          ? undefined
          : `Review deadline: ${new Date(deadlineMs).toLocaleString()}`
      }
      className={cn(
        "flex items-center gap-1 font-mono text-xs font-bold tabular-nums",
        overdue ? "text-destructive" : "text-foreground",
        className
      )}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {remaining === null ? "" : formatCountdown(remaining)}
    </span>
  );
}
