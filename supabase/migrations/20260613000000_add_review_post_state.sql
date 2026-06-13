-- Track automated verification-note posting per proposal.
--   review_post_state: NULL = not yet handled, 'posted' = note posted, 'flagged' = audit
--   flagged a discrepancy (NOT posted, operator emailed).
ALTER TABLE proposals_seen
  ADD COLUMN IF NOT EXISTS review_post_state TEXT,
  ADD COLUMN IF NOT EXISTS review_post_url TEXT,
  ADD COLUMN IF NOT EXISTS review_flagged_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_posted_at TIMESTAMPTZ;

-- Reconciler scans for proposals not yet handled.
CREATE INDEX IF NOT EXISTS idx_proposals_seen_review_pending
  ON proposals_seen (proposal_id)
  WHERE review_post_state IS NULL;
