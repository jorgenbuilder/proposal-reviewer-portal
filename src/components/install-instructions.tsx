"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Platform = "ios" | "android" | "desktop" | "unknown";

function getInitialPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) {
    return "ios";
  }

  if (/android/.test(ua)) {
    return "android";
  }

  return "desktop";
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallInstructions() {
  const [platform] = useState<Platform>(getInitialPlatform);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">ICP Proposal Reviewer</CardTitle>
          <CardDescription>
            Install this app to get notified about new ICP governance proposals
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {deferredPrompt && (
            <Button onClick={handleInstallClick} className="w-full" size="lg">
              Install App
            </Button>
          )}

          {platform === "ios" && (
            <div className="space-y-4">
              <h3 className="font-semibold">Install on iOS</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  Tap the <strong>Share</strong> button in Safari (square with arrow)
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>
                </li>
                <li>
                  Tap <strong>Add</strong> in the top right
                </li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Note: You must use Safari to install this app on iOS.
              </p>
            </div>
          )}

          {platform === "android" && !deferredPrompt && (
            <div className="space-y-4">
              <h3 className="font-semibold">Install on Android</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  Tap the <strong>menu</strong> button (three dots)
                </li>
                <li>
                  Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>
                </li>
                <li>
                  Tap <strong>Install</strong> to confirm
                </li>
              </ol>
            </div>
          )}

          {platform === "desktop" && !deferredPrompt && (
            <div className="space-y-4">
              <h3 className="font-semibold">Install on Desktop</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>
                  Look for the <strong>install icon</strong> in the address bar
                </li>
                <li>
                  Or click the menu and select <strong>Install ICP Proposal Reviewer</strong>
                </li>
              </ol>
              <p className="text-xs text-muted-foreground">
                Works best in Chrome, Edge, or other Chromium-based browsers.
              </p>
            </div>
          )}

          <div className="pt-4 border-t">
            <p className="text-xs text-center text-muted-foreground">
              This app requires installation to send push notifications about new proposals.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
