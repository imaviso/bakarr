CREATE TABLE `anidb_episode_cache` (
	`anime_id` integer PRIMARY KEY NOT NULL,
	`episodes` text NOT NULL,
	`updated_at` text NOT NULL
);
