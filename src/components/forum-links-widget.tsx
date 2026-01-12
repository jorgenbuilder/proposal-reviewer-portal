"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const queryClient = useQueryClient();
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const {
    data: threads = [],
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ["forumThreads", proposalId],
    queryFn: () => fetchForumThreads(proposalId),
  });

  const addMutation = useMutation({
    mutationFn: async ({
      url,
      title,
    }: {
      url: string;
      title: string;
    }) => {
      const response = await fetch("/api/forum-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId,
          forumUrl: url,
          threadTitle: title || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to add link");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forumThreads", proposalId] });
      setNewUrl("");
      setNewTitle("");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (forumUrl: string) => {
      const response = await fetch("/api/forum-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, forumUrl }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete link");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["forumThreads", proposalId] });
    },
  });

  const handleAddLink = () => {
    if (!newUrl.trim()) {
      setError("Please enter a URL");
      return;
    }
    if (!newUrl.includes("forum.dfinity.org")) {
      setError("URL must be from forum.dfinity.org");
      return;
    }
    setError(null);
    addMutation.mutate({ url: newUrl, title: newTitle });
  };

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
        {/* Existing threads */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : fetchError ? (
          <p className="text-sm text-destructive">Failed to load threads</p>
        ) : threads.length > 0 ? (
          <div className="space-y-2">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
              >
                <a
                  href={thread.forum_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:underline truncate flex-1"
                >
                  {thread.thread_title || thread.forum_url}
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteMutation.mutate(thread.forum_url)}
                  disabled={deleteMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  Remove
                </Button>
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

        {/* Add new link form */}
        <div className="pt-4 border-t space-y-3">
          <p className="text-sm font-medium">Add Forum Link</p>
          <div className="space-y-2">
            <Input
              placeholder="https://forum.dfinity.org/t/..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <Input
              placeholder="Thread title (optional)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={handleAddLink}
            disabled={addMutation.isPending}
            size="sm"
          >
            {addMutation.isPending ? "Adding..." : "Add Link"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
