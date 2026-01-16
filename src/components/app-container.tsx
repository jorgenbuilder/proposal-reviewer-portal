"use client";

import { useState, useEffect } from "react";
import { isStandalone, isPushSupported, registerServiceWorker } from "@/lib/push";
import { InstallInstructions } from "./install-instructions";
import { NotificationPrompt } from "./notification-prompt";
import { ProposalDataTable } from "./proposal-data-table";

type AppState = "loading" | "install" | "notifications" | "ready";

export function AppContainer() {
  const [state, setState] = useState<AppState>("loading");

  useEffect(() => {
    async function checkState() {
      // Check if running in standalone mode
      if (!isStandalone()) {
        setState("install");
        return;
      }

      // Check if push is supported
      if (!isPushSupported()) {
        // If push isn't supported, just show the app
        setState("ready");
        return;
      }

      // Check if already subscribed
      const registration = await registerServiceWorker();
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          setState("ready");
          return;
        }
      }

      // Check notification permission
      if (Notification.permission === "granted") {
        // Permission granted but no subscription - need to resubscribe
        setState("notifications");
        return;
      }

      setState("notifications");
    }

    checkState();
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (state === "install") {
    return <InstallInstructions />;
  }

  if (state === "notifications") {
    return <NotificationPrompt onComplete={() => setState("ready")} />;
  }

  return <ProposalDataTable />;
}
