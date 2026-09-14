-- Migration: Populate latitude and longitude columns from PostGIS geom
-- This ensures existing houses have coordinates in the latitude/longitude columns

-- Update latitude from ST_Y (extract Y coordinate from geometry)
UPDATE houses
SET latitude = ST_Y(geom::geometry)
WHERE geom IS NOT NULL 
  AND (latitude IS NULL OR latitude = 0);

-- Update longitude from ST_X (extract X coordinate from geometry)
UPDATE houses
SET longitude = ST_X(geom::geometry)
WHERE geom IS NOT NULL 
  AND (longitude IS NULL OR longitude = 0);

-- Comment for documentation
COMMENT ON COLUMN houses.latitude IS 'Latitude coordinate extracted from PostGIS geom';
COMMENT ON COLUMN houses.longitude IS 'Longitude coordinate extracted from PostGIS geom';
