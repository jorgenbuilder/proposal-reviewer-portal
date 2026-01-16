-- Add is_canonical field to proposal_forum_threads
-- Auto-detected forum posts are marked as canonical, user-added ones are not

ALTER TABLE proposal_forum_threads
ADD COLUMN is_canonical BOOLEAN DEFAULT FALSE;

-- Add index for querying canonical forum threads
CREATE INDEX IF NOT EXISTS idx_proposal_forum_threads_canonical
ON proposal_forum_threads(proposal_id, is_canonical)
WHERE is_canonical = TRUE;
