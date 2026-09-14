-- Migration: Fix app_saved_houses table for UUID compatibility
-- This ensures the table exists with correct types for both user_id and house_id

-- Drop table if it exists with wrong schema (data will be lost in production, but this is initial setup)
DROP TABLE IF EXISTS app_saved_houses CASCADE;

-- Create table with correct UUID types
CREATE TABLE IF NOT EXISTS app_saved_houses (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  house_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, house_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_saved_houses_user_id
ON app_saved_houses (user_id);

CREATE INDEX IF NOT EXISTS idx_app_saved_houses_house_id
ON app_saved_houses (house_id);

-- Comment for documentation
COMMENT ON TABLE app_saved_houses IS 'Stores user-saved houses for the mobile app';
COMMENT ON COLUMN app_saved_houses.user_id IS 'UUID of the user who saved the house';
COMMENT ON COLUMN app_saved_houses.house_id IS 'UUID of the saved house';
