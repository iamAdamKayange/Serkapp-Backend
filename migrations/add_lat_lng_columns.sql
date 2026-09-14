-- Migration: Add latitude and longitude columns to houses table
-- This ensures the columns exist for coordinate storage

-- Add latitude column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'houses' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE houses ADD COLUMN latitude DOUBLE PRECISION;
  END IF;
END $$;

-- Add longitude column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'houses' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE houses ADD COLUMN longitude DOUBLE PRECISION;
  END IF;
END $$;

-- Create indexes for faster queries on coordinates
CREATE INDEX IF NOT EXISTS idx_houses_latitude ON houses(latitude);
CREATE INDEX IF NOT EXISTS idx_houses_longitude ON houses(longitude);

-- Comment for documentation
COMMENT ON COLUMN houses.latitude IS 'Latitude coordinate of the house location';
COMMENT ON COLUMN houses.longitude IS 'Longitude coordinate of the house location';
