-- Migration: Add preferred_language column to users table
-- This migration adds a preferred_language field to support bilingual notifications

-- Add the column with a default value of 'sw' (Kiswahili)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) NOT NULL DEFAULT 'sw';

-- Add a check constraint to ensure only valid language codes
ALTER TABLE users 
ADD CONSTRAINT chk_preferred_language 
CHECK (preferred_language IN ('sw', 'en'));

-- Create an index for faster queries on language
CREATE INDEX IF NOT EXISTS idx_users_preferred_language 
ON users (preferred_language);

-- Comment for documentation
COMMENT ON COLUMN users.preferred_language IS 'User preferred language: sw (Kiswahili) or en (English)';