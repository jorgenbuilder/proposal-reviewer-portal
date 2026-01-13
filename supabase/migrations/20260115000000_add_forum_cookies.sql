-- Add forum cookie storage and audit logging
-- Stores encrypted forum authentication cookies for GitHub Actions

-- Store encrypted forum cookies (single row table)
CREATE TABLE IF NOT EXISTS forum_cookies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cookies_encrypted TEXT NOT NULL, -- AES-256-GCM encrypted JSON array
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Function to ensure only one row exists
CREATE OR REPLACE FUNCTION enforce_single_cookie_row()
RETURNS TRIGGER AS $$
BEGIN
  -- If a row already exists, update it instead of inserting
  IF (SELECT COUNT(*) FROM forum_cookies) > 0 THEN
    UPDATE forum_cookies
    SET cookies_encrypted = NEW.cookies_encrypted,
        updated_at = NEW.updated_at,
        updated_by = NEW.updated_by
    WHERE id = (SELECT id FROM forum_cookies LIMIT 1);
    RETURN NULL; -- Prevent insert
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce single row
CREATE TRIGGER ensure_single_cookie_row
BEFORE INSERT ON forum_cookies
FOR EACH ROW
EXECUTE FUNCTION enforce_single_cookie_row();

-- Forum search audit log
CREATE TABLE IF NOT EXISTS forum_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id TEXT NOT NULL,
  search_query TEXT NOT NULL,
  results_count INTEGER NOT NULL,
  selected_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'no_results', 'auth_failed', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_forum_search_log_proposal ON forum_search_log(proposal_id);
CREATE INDEX IF NOT EXISTS idx_forum_search_log_created_at ON forum_search_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_search_log_status ON forum_search_log(status);

-- Comments for documentation
COMMENT ON TABLE forum_cookies IS 'Stores encrypted forum authentication cookies (single row enforced)';
COMMENT ON COLUMN forum_cookies.cookies_encrypted IS 'AES-256-GCM encrypted JSON array of cookie objects';
COMMENT ON TABLE forum_search_log IS 'Audit log of forum search attempts by GitHub Actions';
