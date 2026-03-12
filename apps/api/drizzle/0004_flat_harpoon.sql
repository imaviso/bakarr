CREATE TABLE `background_jobs` (
	`name` text PRIMARY KEY NOT NULL,
	`is_running` integer DEFAULT false NOT NULL,
	`last_run_at` text,
	`last_success_at` text,
	`last_status` text,
	`last_message` text,
	`run_count` integer DEFAULT 0 NOT NULL
);
