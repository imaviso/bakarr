CREATE TABLE `external_id_map` (
	`anilist_id` integer PRIMARY KEY NOT NULL,
	`mal_id` integer UNIQUE,
	`anidb_aid` integer UNIQUE,
	`updated_at` text NOT NULL
);
CREATE INDEX `external_id_map_mal_id_idx` ON `external_id_map` (`mal_id`);
CREATE INDEX `external_id_map_anidb_aid_idx` ON `external_id_map` (`anidb_aid`);
