import { NextResponse } from "next/server";
import { saveSubscription, deleteSubscription } from "@/lib/db";

interface SubscribeRequest {
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  email?: string;
}

export async function POST(request: Request) {
  try {
    const body: SubscribeRequest = await request.json();

    if (!body.subscription?.endpoint || !body.subscription?.keys) {
      return NextResponse.json(
        { error: "Invalid subscription data" },
        { status: 400 }
      );
    }

    await saveSubscription(
      body.subscription.endpoint,
      body.subscription.keys.p256dh,
      body.subscription.keys.auth,
      body.email
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Subscribe error:", error);
    return NextResponse.json(
      { error: "Failed to save subscription" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json(
        { error: "Endpoint required" },
        { status: 400 }
      );
    }

    await deleteSubscription(endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json(
      { error: "Failed to delete subscription" },
      { status: 500 }
    );
  }
}
