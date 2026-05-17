PRAGMA foreign_keys=OFF;
--> statement-breakpoint
ALTER TABLE `anime` RENAME TO `media`;
--> statement-breakpoint
ALTER TABLE `media` RENAME COLUMN `episode_count` TO `unit_count`;
--> statement-breakpoint
ALTER TABLE `media` RENAME COLUMN `next_airing_episode` TO `next_airing_unit`;
--> statement-breakpoint
ALTER TABLE `media` RENAME COLUMN `related_anime` TO `related_media`;
--> statement-breakpoint
ALTER TABLE `media` RENAME COLUMN `recommended_anime` TO `recommended_media`;
--> statement-breakpoint
ALTER TABLE `episodes` RENAME TO `media_units`;
--> statement-breakpoint
ALTER TABLE `media_units` RENAME COLUMN `anime_id` TO `media_id`;
--> statement-breakpoint
ALTER TABLE `rss_feeds` RENAME COLUMN `anime_id` TO `media_id`;
--> statement-breakpoint
ALTER TABLE `downloads` RENAME COLUMN `anime_id` TO `media_id`;
--> statement-breakpoint
ALTER TABLE `downloads` RENAME COLUMN `anime_title` TO `media_title`;
--> statement-breakpoint
ALTER TABLE `downloads` RENAME COLUMN `episode_number` TO `unit_number`;
--> statement-breakpoint
ALTER TABLE `downloads` RENAME COLUMN `covered_episodes` TO `covered_units`;
--> statement-breakpoint
ALTER TABLE `download_events` RENAME COLUMN `anime_id` TO `media_id`;
--> statement-breakpoint
ALTER TABLE `anidb_episode_cache` RENAME COLUMN `anime_id` TO `media_id`;
--> statement-breakpoint
ALTER TABLE `operations_tasks` RENAME COLUMN `anime_id` TO `media_id`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
