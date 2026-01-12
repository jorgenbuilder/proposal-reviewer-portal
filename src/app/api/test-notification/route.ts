import { NextResponse } from "next/server";
import {
  sendPushNotification,
  PushPayload,
} from "@/lib/web-push-server";
import { getSubscriptions, deleteSubscription } from "@/lib/db";
import { sendProposalNotificationEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { simulateFailure } = body as {
      simulateFailure?: boolean;
    };

    // Fetch all subscriptions from the database
    const subscriptions = await getSubscriptions();

    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: "No subscriptions found" },
        { status: 404 }
      );
    }

    const payload: PushPayload = {
      title: simulateFailure
        ? "Test Notification (Failure Test)"
        : "Test Notification",
      body: simulateFailure
        ? "This tests the email fallback when push fails."
        : "Push notifications are working correctly!",
      proposalId: "test",
      url: "/",
    };

    const results = {
      pushSuccess: 0,
      pushFailed: 0,
      emailSent: 0,
      emailFailed: 0,
      expired: 0,
    };

    for (const sub of subscriptions) {
      if (simulateFailure) {
        // Skip push, go straight to email fallback
        results.pushFailed++;

        if (sub.email) {
          const emailSent = await sendProposalNotificationEmail(sub.email, {
            proposalId: "test",
            title: "Test Notification (Email Fallback)",
            topic: "Test",
            dashboardUrl: "https://dashboard.internetcomputer.org",
            appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app",
          });

          if (emailSent) {
            results.emailSent++;
          } else {
            results.emailFailed++;
          }
        }
      } else {
        // Try to send push notification
        try {
          const success = await sendPushNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          );

          if (success) {
            results.pushSuccess++;
          } else {
            results.pushFailed++;
            // Send email fallback if available
            if (sub.email) {
              const emailSent = await sendProposalNotificationEmail(sub.email, {
                proposalId: "test",
                title: "Test Notification (Email Fallback)",
                topic: "Test",
                dashboardUrl: "https://dashboard.internetcomputer.org",
                appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app",
              });
              if (emailSent) results.emailSent++;
              else results.emailFailed++;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message === "SUBSCRIPTION_EXPIRED") {
            results.expired++;
            // Delete expired subscription
            await deleteSubscription(sub.endpoint);
          } else {
            results.pushFailed++;
          }

          // Send email fallback if available
          if (sub.email) {
            const emailSent = await sendProposalNotificationEmail(sub.email, {
              proposalId: "test",
              title: "Test Notification (Email Fallback)",
              topic: "Test",
              dashboardUrl: "https://dashboard.internetcomputer.org",
              appUrl: process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app",
            });
            if (emailSent) results.emailSent++;
            else results.emailFailed++;
          }
        }
      }
    }

    const totalDevices = subscriptions.length;
    const message = simulateFailure
      ? `Simulated failure for ${totalDevices} device(s). Emails sent: ${results.emailSent}, failed: ${results.emailFailed}`
      : `Sent to ${results.pushSuccess}/${totalDevices} device(s). Push failed: ${results.pushFailed}, expired: ${results.expired}, email fallbacks: ${results.emailSent}`;

    return NextResponse.json({
      success: results.pushSuccess > 0 || results.emailSent > 0,
      message,
      results,
    });
  } catch (error) {
    console.error("Test notification error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to send test notifications",
      },
      { status: 500 }
    );
  }
}
