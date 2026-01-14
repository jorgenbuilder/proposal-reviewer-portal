-- Add proposal_timestamp to proposals_seen table
-- This stores the on-chain proposal creation timestamp

ALTER TABLE proposals_seen
ADD COLUMN IF NOT EXISTS proposal_timestamp TIMESTAMPTZ;

-- Add comment
COMMENT ON COLUMN proposals_seen.proposal_timestamp IS 'On-chain proposal creation timestamp from NNS governance canister';
