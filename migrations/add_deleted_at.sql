-- Migration: Add deleted_at column to houses table
-- This migration adds soft delete functionality

-- Add the column with default NULL (not deleted)
ALTER TABLE houses 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create an index for faster queries on deleted houses
CREATE INDEX IF NOT EXISTS idx_houses_deleted_at 
ON houses (deleted_at);

-- Comment for documentation
COMMENT ON COLUMN houses.deleted_at IS 'Soft delete timestamp. NULL means the house is active, any value means it has been deleted.';
