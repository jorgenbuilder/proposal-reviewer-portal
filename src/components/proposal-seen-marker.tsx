"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface ProposalSeenMarkerProps {
  proposalId: string;
}

export function ProposalSeenMarker({ proposalId }: ProposalSeenMarkerProps) {
  const queryClient = useQueryClient();
  const markedRef = useRef(false);

  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;

    fetch(`/api/proposals/${proposalId}/seen`, {
      method: "POST",
    })
      .then((res) => {
        if (res.ok) {
          // Invalidate proposals list so the seen status is updated
          queryClient.invalidateQueries({ queryKey: ["proposals"] });
        }
      })
      .catch((err) => {
        console.error("Failed to mark proposal as seen:", err);
      });
  }, [proposalId, queryClient]);

  return null;
}
