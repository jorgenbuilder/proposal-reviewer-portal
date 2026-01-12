import { ActionRun } from "@/lib/github";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface BuildVerificationWidgetProps {
  isUpgradeProposal: boolean;
  verificationRun: ActionRun | null;
  proposalId: string;
}

type VerificationStatus =
  | "verified"
  | "failed"
  | "in_progress"
  | "pending"
  | "not_expected";

function getVerificationStatus(
  isUpgradeProposal: boolean,
  verificationRun: ActionRun | null
): VerificationStatus {
  if (!isUpgradeProposal) {
    return "not_expected";
  }

  if (!verificationRun) {
    return "pending";
  }

  if (verificationRun.status !== "completed") {
    return "in_progress";
  }

  return verificationRun.conclusion === "success" ? "verified" : "failed";
}

function StatusIndicator({ status }: { status: VerificationStatus }) {
  const statusConfig = {
    verified: {
      color: "bg-green-500",
      animate: false,
    },
    failed: {
      color: "bg-red-500",
      animate: false,
    },
    in_progress: {
      color: "bg-yellow-500",
      animate: true,
    },
    pending: {
      color: "bg-gray-400 dark:bg-gray-600",
      animate: true,
    },
    not_expected: {
      color: "bg-gray-300 dark:bg-gray-700",
      animate: false,
    },
  };

  const config = statusConfig[status];

  return (
    <div
      className={`w-3 h-3 rounded-full ${config.color} ${
        config.animate ? "animate-pulse" : ""
      }`}
    />
  );
}

function getStatusText(status: VerificationStatus): string {
  switch (status) {
    case "verified":
      return "Build Verified";
    case "failed":
      return "Verification Failed";
    case "in_progress":
      return "Verification In Progress";
    case "pending":
      return "Verification Pending";
    case "not_expected":
      return "No Verification Required";
  }
}

function getStatusDescription(
  status: VerificationStatus,
  verificationRun: ActionRun | null
): string {
  switch (status) {
    case "verified":
      return (
        verificationRun?.displayTitle ||
        "The build output matches the expected WASM hash."
      );
    case "failed":
      return (
        verificationRun?.displayTitle ||
        "The build verification failed. The WASM hash may not match."
      );
    case "in_progress":
      return (
        verificationRun?.displayTitle ||
        "The verification build is currently running."
      );
    case "pending":
      return "A verification workflow has not been triggered yet. This may happen automatically soon.";
    case "not_expected":
      return "This proposal type does not require build verification.";
  }
}

export function BuildVerificationWidget({
  isUpgradeProposal,
  verificationRun,
  proposalId,
}: BuildVerificationWidgetProps) {
  const status = getVerificationStatus(isUpgradeProposal, verificationRun);
  const statusText = getStatusText(status);
  const description = getStatusDescription(status, verificationRun);

  return (
    <Card
      className={
        status === "failed"
          ? "border-red-500/50"
          : status === "verified"
          ? "border-green-500/50"
          : ""
      }
    >
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-3">
          <StatusIndicator status={status} />
          Build Verification
        </CardTitle>
        <CardDescription>
          {isUpgradeProposal
            ? "This proposal upgrades canister code and requires verification."
            : "This proposal does not involve code changes."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium">{statusText}</p>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>

        {verificationRun && (
          <Button variant="outline" size="sm" asChild>
            <a
              href={verificationRun.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Verification Run
              {status === "verified" && <span className="ml-2">✓</span>}
              {status === "failed" && <span className="ml-2">✗</span>}
            </a>
          </Button>
        )}

        {status === "pending" && (
          <p className="text-xs text-muted-foreground">
            Proposal #{proposalId} is awaiting automated verification.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
