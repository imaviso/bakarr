-- Add unique index on infoHash to prevent duplicate downloads
-- Note: infoHash can be null for magnet-only entries, so we filter for non-null
CREATE UNIQUE INDEX IF NOT EXISTS downloads_info_hash_unique ON downloads(info_hash) WHERE info_hash IS NOT NULL;