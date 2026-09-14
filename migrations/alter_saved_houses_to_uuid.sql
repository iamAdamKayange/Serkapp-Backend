-- Migration: Alter app_saved_houses table to use UUID types safely
-- This changes the column types from TEXT to UUID without dropping the table

-- First, check if table exists, if not create it with correct schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'app_saved_houses'
  ) THEN
    CREATE TABLE app_saved_houses (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      house_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, house_id)
    );
  END IF;
END $$;

-- Check if table exists and alter columns if needed
DO $$
BEGIN
  -- Alter user_id column to UUID if it's TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_saved_houses' AND column_name = 'user_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE app_saved_houses ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
  END IF;
  
  -- Alter house_id column to UUID if it's TEXT
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_saved_houses' AND column_name = 'house_id' AND data_type = 'text'
  ) THEN
    ALTER TABLE app_saved_houses ALTER COLUMN house_id TYPE UUID USING house_id::uuid;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_app_saved_houses_user_id
ON app_saved_houses (user_id);

CREATE INDEX IF NOT EXISTS idx_app_saved_houses_house_id
ON app_saved_houses (house_id);

-- Drop old fcm_token index if it exists (from old schema)
DROP INDEX IF EXISTS idx_app_saved_houses_token;

-- Comment for documentation
COMMENT ON TABLE app_saved_houses IS 'Stores user-saved houses for the mobile app';
COMMENT ON COLUMN app_saved_houses.user_id IS 'UUID of the user who saved the house';
COMMENT ON COLUMN app_saved_houses.house_id IS 'UUID of the saved house';
