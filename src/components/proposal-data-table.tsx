"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { RotateCw, Github, Check, Clock, Settings, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VerificationStatus } from "@/lib/github";
import { TOPIC_NAMES } from "@/lib/nns";
import { NotificationPreferences } from "@/components/notification-preferences";
import { registerServiceWorker } from "@/lib/push";
import { DiffStatsBar } from "@/components/diff-stats";

interface Proposal {
  id: string;
  title: string;
  topic: string;
  seenAt: string;
  notified: boolean;
  commitHash: string | null;
  proposalUrl: string | null;
  verificationStatus: VerificationStatus;
  verificationRunUrl: string | null;
  viewerSeenAt: string | null;
  reviewForumUrl: string | null;
  reviewedAt: string | null;
  commentaryTitle: string | null;
  forumThreadUrl: string | null;
  proposalTimestamp: string | null;
  linesAdded: number | null;
  linesRemoved: number | null;
}

async function fetchProposals(): Promise<Proposal[]> {
  const response = await fetch("/api/proposals");
  if (!response.ok) {
    throw new Error("Failed to fetch proposals");
  }
  const data = await response.json();
  return data.proposals || [];
}

function VerificationStatusIndicator({ status }: { status: VerificationStatus }) {
  const config = {
    verified: { color: "bg-green-500", animate: false, label: "Verified" },
    failed: { color: "bg-red-500", animate: false, label: "Failed" },
    in_progress: { color: "bg-yellow-500", animate: true, label: "In Progress" },
    pending: { color: "bg-gray-400 dark:bg-gray-600", animate: true, label: "Pending" },
  };
  const { color, animate, label } = config[status];

  return (
    <div className="flex items-center gap-1.5" title={`Verification: ${label}`}>
      <div className={`w-2 h-2 rounded-full ${color} ${animate ? "animate-pulse" : ""}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function ReviewStatusBadge({ proposal }: { proposal: Proposal }) {
  if (!proposal.viewerSeenAt) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium">
        New
      </span>
    );
  }

  if (!proposal.reviewForumUrl) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 text-xs font-medium">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  }

  return (
    <a
      href={proposal.reviewForumUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-xs font-medium hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <Check className="h-3 w-3" />
      Reviewed
    </a>
  );
}

export function ProposalDataTable() {
  const {
    data: proposals = [],
    isLoading,
    isFetching,
    error,
    dataUpdatedAt,
    refetch,
  } = useQuery({
    queryKey: ["proposals"],
    queryFn: fetchProposals,
    refetchInterval: 60 * 1000,
  });

  const [testingNotification, setTestingNotification] = useState(false);
  const [testingFailure, setTestingFailure] = useState(false);
  const [testResult, setTestResult] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [subscriptionEndpoint, setSubscriptionEndpoint] = useState<string | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);

  // Check for existing subscription
  useEffect(() => {
    async function checkSubscription() {
      try {
        const registration = await registerServiceWorker();
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          if (subscription) {
            setSubscriptionEndpoint(subscription.endpoint);
          }
        }
      } catch (error) {
        console.error("Failed to check subscription:", error);
      }
    }
    checkSubscription();
  }, []);

  const handleTestNotification = async (simulateFailure: boolean) => {
    if (simulateFailure) {
      setTestingFailure(true);
    } else {
      setTestingNotification(true);
    }
    setTestResult(null);

    try {
      const response = await fetch("/api/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulateFailure }),
      });

      const data = await response.json();

      if (data.success) {
        setTestResult({
          type: "success",
          message: data.message,
        });
      } else if (response.status === 404) {
        setTestResult({
          type: "error",
          message: "No subscriptions found. Please enable notifications first.",
        });
      } else {
        setTestResult({
          type: "error",
          message: data.message || "Failed to send notification",
        });
      }
    } catch (err) {
      console.error("Test notification error:", err);
      setTestResult({
        type: "error",
        message: "An unexpected error occurred",
      });
    } finally {
      setTestingNotification(false);
      setTestingFailure(false);
    }
  };

  // Get unique topics from proposals
  const uniqueTopics = useMemo(() => {
    const topics = new Set(proposals.map(p => p.topic));
    return Array.from(topics).sort();
  }, [proposals]);

  // Filter proposals by topic
  const filteredProposals = useMemo(() => {
    if (topicFilter === "all") return proposals;
    return proposals.filter(p => p.topic === topicFilter);
  }, [proposals, topicFilter]);

  const columns: ColumnDef<Proposal>[] = useMemo(
    () => [
      {
        accessorKey: "id",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-foreground"
          >
            ID
            {column.getIsSorted() === "asc" ? (
              <ChevronUp className="h-3 w-3" />
            ) : column.getIsSorted() === "desc" ? (
              <ChevronDown className="h-3 w-3" />
            ) : null}
          </button>
        ),
        cell: ({ row }) => (
          <a
            href={`/proposals/${row.original.id}`}
            className="font-mono text-sm hover:underline"
          >
            #{row.original.id}
          </a>
        ),
        size: 100,
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => (
          <div className="space-y-1">
            <a
              href={`/proposals/${row.original.id}`}
              className="font-medium hover:underline"
            >
              {row.original.title}
            </a>
            {row.original.commentaryTitle && (
              <div className="text-xs italic text-muted-foreground/80">
                AI: {row.original.commentaryTitle}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "topic",
        header: "Topic",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.topic}</span>
        ),
        size: 200,
      },
      {
        accessorKey: "proposalTimestamp",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-foreground"
          >
            Created
            {column.getIsSorted() === "asc" ? (
              <ChevronUp className="h-3 w-3" />
            ) : column.getIsSorted() === "desc" ? (
              <ChevronDown className="h-3 w-3" />
            ) : null}
          </button>
        ),
        cell: ({ row }) => {
          if (!row.original.proposalTimestamp) return null;
          return (
            <span className="text-xs text-muted-foreground">
              {new Date(row.original.proposalTimestamp).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          );
        },
        size: 150,
      },
      {
        accessorKey: "linesAdded",
        header: "Changes",
        cell: ({ row }) => (
          <DiffStatsBar
            linesAdded={row.original.linesAdded}
            linesRemoved={row.original.linesRemoved}
          />
        ),
        size: 140,
      },
      {
        accessorKey: "verificationStatus",
        header: "Verification",
        cell: ({ row }) => (
          <VerificationStatusIndicator status={row.original.verificationStatus} />
        ),
        size: 120,
      },
      {
        accessorKey: "viewerSeenAt",
        header: "Review",
        cell: ({ row }) => <ReviewStatusBadge proposal={row.original} />,
        size: 120,
      },
      {
        id: "actions",
        header: "Links",
        cell: ({ row }) => {
          const dashboardUrl = `https://dashboard.internetcomputer.org/proposal/${row.original.id}`;
          const githubDiffUrl = row.original.proposalUrl?.includes("github.com")
            ? row.original.proposalUrl
            : row.original.commitHash
            ? `https://github.com/search?q=${row.original.commitHash}&type=commits`
            : null;

          return (
            <div className="flex items-center gap-2">
              {row.original.forumThreadUrl && (
                <a
                  href={row.original.forumThreadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  title="Forum Discussion"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MessageSquare className="h-4 w-4" />
                </a>
              )}
              {githubDiffUrl && (
                <a
                  href={githubDiffUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  title="GitHub Commit"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Github className="h-4 w-4" />
                </a>
              )}
            </div>
          );
        },
        size: 100,
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredProposals,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageSize: 50,
      },
      sorting: [
        {
          id: "id",
          desc: true,
        },
      ],
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">ICP Proposal Reviewer</h1>
            <p className="text-sm text-muted-foreground">
              Network Nervous System Proposals
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/cookies" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Forum Cookies</span>
            </a>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Test Notification Buttons */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Notifications</CardTitle>
                <CardDescription>
                  Test your notification setup and manage preferences
                </CardDescription>
              </div>
              {subscriptionEndpoint && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreferences(!showPreferences)}
                >
                  {showPreferences ? "Hide" : "Preferences"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => handleTestNotification(false)}
                disabled={testingNotification || testingFailure}
              >
                {testingNotification ? "Sending..." : "Test Notification"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleTestNotification(true)}
                disabled={testingNotification || testingFailure}
              >
                {testingFailure ? "Simulating..." : "Test Failure"}
              </Button>
            </div>
            {testResult && (
              <p
                className={`text-sm ${
                  testResult.type === "success"
                    ? "text-green-600 dark:text-green-400"
                    : testResult.type === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {testResult.message}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        {showPreferences && subscriptionEndpoint && (
          <NotificationPreferences endpoint={subscriptionEndpoint} />
        )}

        {/* Topic Filter and Last Updated */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Topic:</span>
            <Select value={topicFilter} onValueChange={setTopicFilter}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="All Topics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Topics</SelectItem>
                {uniqueTopics.map((topic) => (
                  <SelectItem key={topic} value={topic}>
                    {topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dataUpdatedAt > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Last updated: {new Date(dataUpdatedAt).toLocaleTimeString()}</span>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-1 hover:bg-muted rounded-sm transition-colors disabled:opacity-50"
                title="Refresh proposals"
              >
                <RotateCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          )}
        </div>

        {/* Proposals Table */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-pulse text-muted-foreground">
              Loading proposals...
            </div>
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-destructive">
                Failed to load proposals. Please try again later.
              </p>
            </CardContent>
          </Card>
        ) : filteredProposals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                {topicFilter === "all"
                  ? "No proposals yet. You'll be notified when new ones appear."
                  : "No proposals found for this topic."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  const isUnseen = !row.original.viewerSeenAt;
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className={isUnseen ? "bg-blue-50 dark:bg-blue-950/20" : ""}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {filteredProposals.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{" "}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                filteredProposals.length
              )}{" "}
              of {filteredProposals.length} proposals
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
