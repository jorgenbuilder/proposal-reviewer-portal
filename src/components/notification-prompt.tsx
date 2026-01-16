"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  registerServiceWorker,
  requestNotificationPermission,
  subscribeToPush,
  sendSubscriptionToServer,
} from "@/lib/push";

interface NotificationPromptProps {
  onComplete: () => void;
}

export function NotificationPrompt({ onComplete }: NotificationPromptProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEnable = async () => {
    setLoading(true);
    setError(null);

    try {
      // Request notification permission
      const permission = await requestNotificationPermission();

      if (permission !== "granted") {
        setError("Notification permission was denied. Please enable notifications in your browser settings.");
        setLoading(false);
        return;
      }

      // Register service worker
      const registration = await registerServiceWorker();
      if (!registration) {
        setError("Failed to register service worker.");
        setLoading(false);
        return;
      }

      // Subscribe to push
      const subscription = await subscribeToPush(registration);
      if (!subscription) {
        setError("Failed to create push subscription.");
        setLoading(false);
        return;
      }

      // Send to server
      const success = await sendSubscriptionToServer(subscription, email || undefined);
      if (!success) {
        setError("Failed to save subscription. Please try again.");
        setLoading(false);
        return;
      }

      onComplete();
    } catch (err) {
      console.error("Notification setup error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Enable Notifications</CardTitle>
          <CardDescription>
            Get notified when new ICP governance proposals are submitted
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email">Backup Email (optional)</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll send an email if push notification fails
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleEnable}
            className="w-full"
            size="lg"
            disabled={loading}
          >
            {loading ? "Setting up..." : "Enable Notifications"}
          </Button>

          <div className="pt-4 border-t">
            <p className="text-xs text-center text-muted-foreground">
              After enabling, you can customize which proposal topics you want to monitor
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
