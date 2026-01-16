"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ForumThread {
  id: string;
  proposal_id: string;
  forum_url: string;
  thread_title: string | null;
  added_at: string;
}

interface ForumLinksWidgetProps {
  proposalId: string;
  forumCategoryUrl: string;
}

async function fetchForumThreads(proposalId: string): Promise<ForumThread[]> {
  const response = await fetch(`/api/forum-links?proposalId=${proposalId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch forum threads");
  }
  const data = await response.json();
  return data.threads || [];
}

export function ForumLinksWidget({
  proposalId,
  forumCategoryUrl,
}: ForumLinksWidgetProps) {
  const {
    data: threads = [],
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ["forumThreads", proposalId],
    queryFn: () => fetchForumThreads(proposalId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Forum Discussion</CardTitle>
        <CardDescription>
          {threads.length > 0
            ? "Community discussions about this proposal"
            : "No forum threads linked yet"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : fetchError ? (
          <p className="text-sm text-destructive">Failed to load threads</p>
        ) : threads.length > 0 ? (
          <div className="space-y-2">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className="p-2 rounded-md bg-muted/50"
              >
                <a
                  href={thread.forum_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:underline"
                >
                  {thread.thread_title || thread.forum_url}
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No forum threads have been linked to this proposal yet.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a
                href={forumCategoryUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Browse NNS Proposal Discussions
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
