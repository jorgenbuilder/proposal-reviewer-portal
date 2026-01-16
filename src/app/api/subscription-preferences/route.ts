import { NextResponse } from "next/server";
import { updateSubscriptionTopics, getSubscriptions } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint required" }, { status: 400 });
  }

  try {
    const subscriptions = await getSubscriptions();
    const subscription = subscriptions.find((sub) => sub.endpoint === endpoint);

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({
      topics: subscription.topics || [17], // Default to Protocol Canister Management
    });
  } catch (error) {
    console.error("Get preferences error:", error);
    return NextResponse.json(
      { error: "Failed to get preferences" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { endpoint, topics } = body;

    if (!endpoint || !topics || !Array.isArray(topics)) {
      return NextResponse.json(
        { error: "Endpoint and topics array required" },
        { status: 400 }
      );
    }

    await updateSubscriptionTopics(endpoint, topics);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update preferences error:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
