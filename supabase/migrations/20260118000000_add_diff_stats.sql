-- Add lines added/removed tracking for proposals
ALTER TABLE proposals_seen
ADD COLUMN IF NOT EXISTS lines_added integer,
ADD COLUMN IF NOT EXISTS lines_removed integer;

-- Add comment for documentation
COMMENT ON COLUMN proposals_seen.lines_added IS 'Number of lines added in the commit (from GitHub API)';
COMMENT ON COLUMN proposals_seen.lines_removed IS 'Number of lines removed in the commit (from GitHub API)';
