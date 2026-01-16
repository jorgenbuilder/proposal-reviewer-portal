-- Add topic preferences to push subscriptions
-- Allows users to configure which proposal topics they want notifications for

-- Add topics column to store array of topic numbers
ALTER TABLE push_subscriptions
ADD COLUMN topics INTEGER[] DEFAULT ARRAY[17]; -- Default to Protocol Canister Management (topic 17)

-- Add index for topic lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_topics ON push_subscriptions USING GIN (topics);

-- Update existing subscriptions to include all topic numbers by default (for backwards compatibility)
-- Users can then customize which topics they want notifications for
UPDATE push_subscriptions
SET topics = ARRAY[17]
WHERE topics IS NULL;
