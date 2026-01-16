"use client";

interface DiffStatsProps {
  linesAdded: number | null;
  linesRemoved: number | null;
  showTotal?: boolean;
  compact?: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return num.toString();
}

export function DiffStats({
  linesAdded,
  linesRemoved,
  showTotal = false,
  compact = false,
}: DiffStatsProps) {
  if (linesAdded === null && linesRemoved === null) {
    return null;
  }

  const added = linesAdded ?? 0;
  const removed = linesRemoved ?? 0;
  const total = added + removed;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-mono">
        {added > 0 && (
          <span className="text-green-600 dark:text-green-400">
            +{formatNumber(added)}
          </span>
        )}
        {removed > 0 && (
          <span className="text-red-600 dark:text-red-400">
            -{formatNumber(removed)}
          </span>
        )}
        {added === 0 && removed === 0 && (
          <span className="text-muted-foreground">0</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-sm font-mono">
        <span className="text-green-600 dark:text-green-400 font-medium">
          +{formatNumber(added)}
        </span>
        <span className="text-red-600 dark:text-red-400 font-medium">
          -{formatNumber(removed)}
        </span>
      </div>
      {showTotal && total > 0 && (
        <span className="text-xs text-muted-foreground">
          ({formatNumber(total)} lines)
        </span>
      )}
    </div>
  );
}

interface DiffStatsBarProps {
  linesAdded: number | null;
  linesRemoved: number | null;
  maxBlocks?: number;
}

export function DiffStatsBar({
  linesAdded,
  linesRemoved,
  maxBlocks = 5,
}: DiffStatsBarProps) {
  if (linesAdded === null && linesRemoved === null) {
    return null;
  }

  const added = linesAdded ?? 0;
  const removed = linesRemoved ?? 0;
  const total = added + removed;

  if (total === 0) {
    return (
      <div className="flex items-center gap-1.5">
        <DiffStats linesAdded={added} linesRemoved={removed} compact />
        <div className="flex gap-0.5">
          {Array.from({ length: maxBlocks }).map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-sm bg-gray-200 dark:bg-gray-700"
            />
          ))}
        </div>
      </div>
    );
  }

  const addedRatio = added / total;
  const addedBlocks = Math.round(addedRatio * maxBlocks);
  const removedBlocks = maxBlocks - addedBlocks;

  return (
    <div className="flex items-center gap-1.5">
      <DiffStats linesAdded={added} linesRemoved={removed} compact />
      <div className="flex gap-0.5">
        {Array.from({ length: addedBlocks }).map((_, i) => (
          <div
            key={`add-${i}`}
            className="w-2 h-2 rounded-sm bg-green-500"
          />
        ))}
        {Array.from({ length: removedBlocks }).map((_, i) => (
          <div
            key={`rem-${i}`}
            className="w-2 h-2 rounded-sm bg-red-500"
          />
        ))}
      </div>
    </div>
  );
}
