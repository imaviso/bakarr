CREATE TABLE `seasonal_anime_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`season` text NOT NULL,
	`year` integer NOT NULL,
	`page` integer NOT NULL,
	`limit` integer NOT NULL,
	`payload` text NOT NULL,
	`fetched_at_ms` integer NOT NULL
);
