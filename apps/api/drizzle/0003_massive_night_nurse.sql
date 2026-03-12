CREATE TABLE `downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anime_id` integer NOT NULL,
	`anime_title` text NOT NULL,
	`episode_number` integer NOT NULL,
	`torrent_name` text NOT NULL,
	`status` text NOT NULL,
	`progress` integer,
	`added_at` text NOT NULL,
	`download_date` text,
	`group_name` text,
	`magnet` text,
	`info_hash` text,
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rss_feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anime_id` integer NOT NULL,
	`url` text NOT NULL,
	`name` text,
	`last_checked` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade
);
