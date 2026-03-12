CREATE TABLE `download_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`download_id` integer,
	`anime_id` integer,
	`event_type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL
);
