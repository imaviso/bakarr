CREATE TABLE `anime` (
	`id` integer PRIMARY KEY NOT NULL,
	`mal_id` integer,
	`title_romaji` text NOT NULL,
	`title_english` text,
	`title_native` text,
	`format` text NOT NULL,
	`description` text,
	`score` integer,
	`genres` text NOT NULL,
	`studios` text NOT NULL,
	`cover_image` text,
	`banner_image` text,
	`status` text NOT NULL,
	`episode_count` integer,
	`profile_name` text NOT NULL,
	`root_folder` text NOT NULL,
	`added_at` text NOT NULL,
	`monitored` integer DEFAULT true NOT NULL,
	`release_profile_ids` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anime_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text,
	`aired` text,
	`downloaded` integer DEFAULT false NOT NULL,
	`file_path` text,
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade
);
