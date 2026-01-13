-- Initial schema migration
-- Creates all tables for the proposal reviewer portal

-- Push subscriptions for web push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_success TIMESTAMPTZ
);

-- Index for looking up subscriptions by endpoint
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Proposals that have been seen/processed
CREATE TABLE IF NOT EXISTS proposals_seen (
  proposal_id BIGINT PRIMARY KEY,
  topic TEXT NOT NULL,
  title TEXT,
  seen_at TIMESTAMPTZ DEFAULT NOW(),
  notified BOOLEAN DEFAULT FALSE,
  commit_hash TEXT,
  proposal_url TEXT
);

-- Index for querying recent proposals
CREATE INDEX IF NOT EXISTS idx_proposals_seen_seen_at ON proposals_seen(seen_at DESC);

-- Notification log for audit trail
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id BIGINT NOT NULL,
  subscription_id UUID NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('push', 'email')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'delivered')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying notifications by proposal
CREATE INDEX IF NOT EXISTS idx_notification_log_proposal_id ON notification_log(proposal_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON notification_log(created_at DESC);

-- Forum thread links for proposals
CREATE TABLE IF NOT EXISTS proposal_forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id TEXT NOT NULL,
  forum_url TEXT NOT NULL,
  thread_title TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(proposal_id, forum_url)
);

-- Index for querying forum threads by proposal
CREATE INDEX IF NOT EXISTS idx_proposal_forum_threads_proposal_id ON proposal_forum_threads(proposal_id);
