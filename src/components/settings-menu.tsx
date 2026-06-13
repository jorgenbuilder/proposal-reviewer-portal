"use client";

import { useState, useEffect, useCallback } from "react";
import { Menu, X, RefreshCw, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationPreferences } from "@/components/notification-preferences";
import {
  isPushSupported,
  isStandalone,
  registerServiceWorker,
  subscribeToPush,
  sendSubscriptionToServer,
  requestNotificationPermission,
} from "@/lib/push";

interface Diagnostics {
  pushSupported: boolean;
  standalone: boolean;
  permission: string;
  swState: string;
  subscribed: boolean;
  endpoint: string | null;
  host: string | null;
  vapidConfigured: boolean;
  userAgent: string;
}

async function gatherDiagnostics(): Promise<Diagnostics> {
  const permission =
    typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  let swState = "none";
  let endpoint: string | null = null;
  try {
    const reg =
      (await navigator.serviceWorker?.getRegistration()) ||
      (await registerServiceWorker());
    if (reg) {
      swState = reg.active ? "active" : reg.installing ? "installing" : reg.waiting ? "waiting" : "registered";
      const sub = await reg.pushManager.getSubscription();
      endpoint = sub?.endpoint ?? null;
    }
  } catch {
    /* ignore */
  }
  let host: string | null = null;
  try {
    host = endpoint ? new URL(endpoint).host : null;
  } catch {
    /* ignore */
  }
  return {
    pushSupported: isPushSupported(),
    standalone: isStandalone(),
    permission,
    swState,
    subscribed: !!endpoint,
    endpoint,
    host,
    vapidConfigured: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean | null }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`text-right break-all font-mono text-xs ${
          ok === true ? "text-green-600 dark:text-green-400" : ok === false ? "text-destructive" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [testing, setTesting] = useState<false | "real" | "fail">(false);
  const [testResult, setTestResult] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setDiag(await gatherDiagnostics());
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleTest = async (simulateFailure: boolean) => {
    setTesting(simulateFailure ? "fail" : "real");
    setTestResult(null);
    try {
      const res = await fetch("/api/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulateFailure }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({
          type: "success",
          message: `Sent. push: ${data.pushSuccess ?? 0} ok / ${data.pushFailed ?? 0} failed${
            data.expired ? `, ${data.expired} expired` : ""
          }${data.emailSent ? `, ${data.emailSent} email` : ""}. If it didn't appear, check your OS notification settings / Focus.`,
        });
      } else {
        setTestResult({ type: "error", message: data.error || data.message || "Failed to send." });
      }
    } catch (e) {
      setTestResult({ type: "error", message: (e as Error).message });
    } finally {
      setTesting(false);
      refresh();
    }
  };

  const handleEnable = async () => {
    setEnabling(true);
    setTestResult(null);
    try {
      const permission = await requestNotificationPermission();
      if (permission !== "granted") {
        setTestResult({ type: "error", message: `Permission ${permission}. Allow notifications in the browser, then retry.` });
        return;
      }
      const reg = await registerServiceWorker();
      if (!reg) {
        setTestResult({ type: "error", message: "Service worker could not be registered on this device/browser." });
        return;
      }
      const sub = await subscribeToPush(reg);
      if (!sub) {
        setTestResult({ type: "error", message: "Could not create a push subscription on this device/browser." });
        return;
      }
      await sendSubscriptionToServer(sub, undefined);
      setTestResult({ type: "success", message: "This device is now subscribed." });
    } catch (e) {
      setTestResult({ type: "error", message: (e as Error).message });
    } finally {
      setEnabling(false);
      refresh();
    }
  };

  const copyDiagnostics = async () => {
    if (!diag) return;
    await navigator.clipboard.writeText(JSON.stringify(diag, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Button variant="ghost" size="sm" aria-label="Settings" onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative h-full w-full max-w-md overflow-y-auto bg-background shadow-xl border-l">
            <div className="sticky top-0 flex items-center justify-between border-b bg-background px-4 py-3">
              <h2 className="text-base font-semibold">Settings</h2>
              <Button variant="ghost" size="sm" aria-label="Close" onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-6 p-4">
              {/* Push diagnostics */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Push diagnostics</h3>
                  <Button variant="ghost" size="sm" onClick={refresh} aria-label="Refresh">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                {diag ? (
                  <div className="rounded-md border p-3">
                    <Row label="Push supported" value={diag.pushSupported ? "yes" : "no"} ok={diag.pushSupported} />
                    <Row label="Installed (standalone)" value={diag.standalone ? "yes" : "no"} ok={diag.standalone} />
                    <Row label="Permission" value={diag.permission} ok={diag.permission === "granted" ? true : diag.permission === "denied" ? false : null} />
                    <Row label="Service worker" value={diag.swState} ok={diag.swState === "active"} />
                    <Row label="Subscribed (this device)" value={diag.subscribed ? "yes" : "no"} ok={diag.subscribed} />
                    <Row label="Push service" value={diag.host || "—"} />
                    <Row label="VAPID configured" value={diag.vapidConfigured ? "yes" : "no"} ok={diag.vapidConfigured} />
                    <div className="mt-2 flex gap-2">
                      <Button variant="outline" size="sm" onClick={copyDiagnostics}>
                        {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                        {copied ? "Copied" : "Copy diagnostics"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                )}
                {diag && diag.permission === "granted" && diag.subscribed && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Subscribed and permitted. If a test doesn&apos;t appear on this device, the push is being
                    delivered but suppressed by the OS — check System notification settings for this browser and
                    turn off Focus / Do Not Disturb.
                  </p>
                )}
              </section>

              {/* Test / enable */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Notifications</h3>
                {diag && !diag.subscribed ? (
                  <Button onClick={handleEnable} disabled={enabling}>
                    {enabling ? "Enabling…" : "Enable on this device"}
                  </Button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => handleTest(false)} disabled={!!testing}>
                      {testing === "real" ? "Sending…" : "Test notification"}
                    </Button>
                    <Button variant="outline" onClick={() => handleTest(true)} disabled={!!testing}>
                      {testing === "fail" ? "Simulating…" : "Test email fallback"}
                    </Button>
                  </div>
                )}
                {testResult && (
                  <p
                    className={`mt-2 text-sm ${
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
              </section>

              {/* Preferences */}
              {diag?.endpoint && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Preferences</h3>
                  <NotificationPreferences endpoint={diag.endpoint} />
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
