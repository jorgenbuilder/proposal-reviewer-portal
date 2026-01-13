"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ReviewStatus {
  viewerSeenAt: string | null;
  reviewForumUrl: string | null;
  reviewedAt: string | null;
}

interface ReviewSubmitWidgetProps {
  proposalId: string;
}

async function fetchReviewStatus(proposalId: string): Promise<ReviewStatus | null> {
  const response = await fetch(`/api/proposals?proposalId=${proposalId}`);
  if (!response.ok) {
    // Fallback: fetch from proposals list and find this one
    const listResponse = await fetch("/api/proposals");
    if (!listResponse.ok) return null;
    const data = await listResponse.json();
    const proposal = data.proposals?.find((p: { id: string }) => p.id === proposalId);
    if (!proposal) return null;
    return {
      viewerSeenAt: proposal.viewerSeenAt,
      reviewForumUrl: proposal.reviewForumUrl,
      reviewedAt: proposal.reviewedAt,
    };
  }
  const data = await response.json();
  return data;
}

export function ReviewSubmitWidget({ proposalId }: ReviewSubmitWidgetProps) {
  const queryClient = useQueryClient();
  const [forumUrl, setForumUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const {
    data: reviewStatus,
    isLoading,
  } = useQuery({
    queryKey: ["reviewStatus", proposalId],
    queryFn: () => fetchReviewStatus(proposalId),
  });

  const submitMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch(`/api/proposals/${proposalId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forumUrl: url }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit review");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewStatus", proposalId] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
      setForumUrl("");
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/proposals/${proposalId}/review`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to clear review");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewStatus", proposalId] });
      queryClient.invalidateQueries({ queryKey: ["proposals"] });
    },
  });

  const handleSubmit = () => {
    if (!forumUrl.trim()) {
      setError("Please enter a forum URL");
      return;
    }
    if (!forumUrl.includes("forum.dfinity.org")) {
      setError("URL must be from forum.dfinity.org");
      return;
    }
    setError(null);
    submitMutation.mutate(forumUrl);
  };

  const isReviewed = reviewStatus?.reviewForumUrl;
  const reviewedDate = reviewStatus?.reviewedAt
    ? new Date(reviewStatus.reviewedAt)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Review Status
          {isReviewed && (
            <span className="inline-flex items-center gap-1 text-sm font-normal text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              Reviewed
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {isReviewed
            ? "You have submitted your review for this proposal"
            : "Submit a link to your forum review post"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : isReviewed ? (
          <div className="space-y-4">
            <div className="p-3 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Review submitted
                {reviewedDate && (
                  <span className="font-normal text-green-600 dark:text-green-400">
                    {" "}on {reviewedDate.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                )}
              </p>
              <a
                href={reviewStatus.reviewForumUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-green-700 dark:text-green-300 hover:underline break-all"
              >
                {reviewStatus.reviewForumUrl}
              </a>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4 mr-1" />
              {clearMutation.isPending ? "Clearing..." : "Clear Review"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Input
                placeholder="https://forum.dfinity.org/t/your-review-post/..."
                value={forumUrl}
                onChange={(e) => setForumUrl(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              size="sm"
            >
              <Check className="h-4 w-4 mr-1" />
              {submitMutation.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
