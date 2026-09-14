-- Add rejection_reason column to houses table
-- This column stores the reason why a house was rejected by admin
-- Helps landlords understand what needs to be corrected

ALTER TABLE houses
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add comment for documentation
COMMENT ON COLUMN houses.rejection_reason IS 'Reason provided by admin when rejecting a house listing';
