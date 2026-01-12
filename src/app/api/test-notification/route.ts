import { NextRequest, NextResponse } from "next/server";
import {
  sendPushNotification,
  WebPushSubscription,
  PushPayload,
} from "@/lib/web-push-server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription, simulateFailure } = body as {
      subscription: WebPushSubscription;
      simulateFailure?: boolean;
    };

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { error: "Invalid subscription data" },
        { status: 400 }
      );
    }

    const payload: PushPayload = {
      title: simulateFailure
        ? "Test Notification (Simulated Failure)"
        : "Test Notification",
      body: simulateFailure
        ? "This notification simulates a delivery failure scenario."
        : "Push notifications are working correctly!",
      proposalId: "test",
      url: "/",
    };

    if (simulateFailure) {
      // Simulate a failed notification by returning failure response
      return NextResponse.json({
        success: false,
        simulated: true,
        message:
          "Simulated push notification failure. In production, this would trigger an email fallback if configured.",
      });
    }

    const success = await sendPushNotification(subscription, payload);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to send push notification",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Test notification sent successfully",
    });
  } catch (error) {
    console.error("Test notification error:", error);

    if (error instanceof Error && error.message === "SUBSCRIPTION_EXPIRED") {
      return NextResponse.json(
        {
          success: false,
          expired: true,
          message: "Push subscription has expired. Please re-subscribe.",
        },
        { status: 410 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to send test notification",
      },
      { status: 500 }
    );
  }
}
