import postgres from "postgres";

const sql = postgres(process.env.POSTGRES_URL!, {
  ssl: "require",
});

// Initialize database tables
export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      last_success TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS proposals_seen (
      proposal_id BIGINT PRIMARY KEY,
      topic TEXT NOT NULL,
      title TEXT,
      seen_at TIMESTAMP DEFAULT NOW(),
      notified BOOLEAN DEFAULT FALSE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notification_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      proposal_id BIGINT NOT NULL,
      subscription_id UUID NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

// Push subscription operations
export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  email: string | null;
  created_at: Date;
  last_success: Date | null;
}

export async function saveSubscription(
  endpoint: string,
  p256dh: string,
  auth: string,
  email?: string
): Promise<void> {
  await sql`
    INSERT INTO push_subscriptions (endpoint, p256dh, auth, email)
    VALUES (${endpoint}, ${p256dh}, ${auth}, ${email || null})
    ON CONFLICT (endpoint) DO UPDATE SET
      p256dh = ${p256dh},
      auth = ${auth},
      email = COALESCE(${email || null}, push_subscriptions.email)
  `;
}

export async function getSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const result = await sql<PushSubscriptionRecord[]>`
    SELECT * FROM push_subscriptions
  `;
  return result;
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await sql`
    DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}
  `;
}

export async function updateSubscriptionSuccess(endpoint: string): Promise<void> {
  await sql`
    UPDATE push_subscriptions SET last_success = NOW() WHERE endpoint = ${endpoint}
  `;
}

// Proposal tracking operations
export interface ProposalSeenRecord {
  proposal_id: string;
  topic: string;
  title: string | null;
  seen_at: Date;
  notified: boolean;
}

export async function markProposalSeen(
  proposalId: string,
  topic: string,
  title: string
): Promise<void> {
  await sql`
    INSERT INTO proposals_seen (proposal_id, topic, title)
    VALUES (${proposalId}, ${topic}, ${title})
    ON CONFLICT (proposal_id) DO NOTHING
  `;
}

export async function getSeenProposalIds(): Promise<Set<string>> {
  const result = await sql<{ proposal_id: string }[]>`
    SELECT proposal_id::TEXT FROM proposals_seen
  `;
  return new Set(result.map((r) => r.proposal_id));
}

export async function markProposalNotified(proposalId: string): Promise<void> {
  await sql`
    UPDATE proposals_seen SET notified = TRUE WHERE proposal_id = ${proposalId}
  `;
}

export async function getRecentProposals(limit: number = 50): Promise<ProposalSeenRecord[]> {
  const result = await sql<ProposalSeenRecord[]>`
    SELECT proposal_id::TEXT as proposal_id, topic, title, seen_at, notified
    FROM proposals_seen
    ORDER BY seen_at DESC
    LIMIT ${limit}
  `;
  return result;
}

// Notification log operations
export async function logNotification(
  proposalId: string,
  subscriptionId: string,
  channel: "push" | "email",
  status: "sent" | "failed" | "delivered",
  error?: string
): Promise<void> {
  await sql`
    INSERT INTO notification_log (proposal_id, subscription_id, channel, status, error)
    VALUES (${proposalId}, ${subscriptionId}, ${channel}, ${status}, ${error || null})
  `;
}
