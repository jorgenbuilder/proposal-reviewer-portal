-- Proposal commentaries table for AI-generated analysis
CREATE TABLE IF NOT EXISTS proposal_commentaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id BIGINT NOT NULL,

  -- Structured fields for querying
  title TEXT,
  canister_id TEXT,
  analysis_incomplete BOOLEAN DEFAULT FALSE,
  incomplete_reason TEXT,

  -- Metadata for tracking
  cost_usd NUMERIC(10, 4),
  duration_ms INTEGER,
  turns INTEGER,

  -- Full commentary data as JSONB
  commentary_data JSONB NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Foreign key constraint (soft reference, CASCADE delete)
  CONSTRAINT fk_proposal_id
    FOREIGN KEY (proposal_id)
    REFERENCES proposals_seen(proposal_id)
    ON DELETE CASCADE
);

-- Index for fetching latest commentary for a proposal
CREATE INDEX idx_proposal_commentaries_proposal_id
  ON proposal_commentaries(proposal_id, created_at DESC);

-- Index for querying incomplete analyses
CREATE INDEX idx_proposal_commentaries_incomplete
  ON proposal_commentaries(analysis_incomplete)
  WHERE analysis_incomplete = TRUE;

-- Index for cost analysis
CREATE INDEX idx_proposal_commentaries_cost
  ON proposal_commentaries(cost_usd);

-- GIN index for JSONB queries (if needed in future)
CREATE INDEX idx_proposal_commentaries_data
  ON proposal_commentaries USING GIN (commentary_data);

-- Add table comment
COMMENT ON TABLE proposal_commentaries IS
  'Stores AI-generated commentary for proposals. Multiple versions per proposal are preserved.';
