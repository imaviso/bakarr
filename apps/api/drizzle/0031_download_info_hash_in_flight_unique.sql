-- Replace blanket info_hash uniqueness with in-flight-only uniqueness so
-- terminal rows (imported/failed) never block re-fetching the same release.
DROP INDEX IF EXISTS `downloads_info_hash_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `downloads_info_hash_in_flight_unique_idx` ON `downloads` (`info_hash`) WHERE `info_hash` IS NOT NULL AND `status` IN ('queued', 'downloading', 'paused');
