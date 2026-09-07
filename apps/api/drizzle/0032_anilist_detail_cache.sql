CREATE TABLE `anilist_detail_cache` (
	`media_id` integer PRIMARY KEY NOT NULL,
	`media_kind` text NOT NULL,
	`payload` text NOT NULL,
	`fetched_at_ms` integer NOT NULL
);
