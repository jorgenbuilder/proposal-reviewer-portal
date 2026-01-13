-- Add review tracking columns to proposals_seen
-- viewer_seen_at: when the reviewer viewed the proposal in the app
-- review_forum_url: link to the forum post where the review was submitted
-- reviewed_at: timestamp when the review was submitted

ALTER TABLE proposals_seen
  ADD COLUMN IF NOT EXISTS viewer_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_forum_url TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Index for querying unseen proposals (those without viewer_seen_at)
CREATE INDEX IF NOT EXISTS idx_proposals_seen_viewer_seen_at ON proposals_seen(viewer_seen_at);
