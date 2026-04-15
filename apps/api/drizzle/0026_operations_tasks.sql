CREATE TABLE `operations_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_key` text NOT NULL,
	`status` text NOT NULL,
	`progress_current` integer,
	`progress_total` integer,
	`message` text,
	`created_at` text NOT NULL,
	`started_at` text,
	`finished_at` text,
	`updated_at` text NOT NULL,
	`anime_id` integer,
	`payload` text
);
--> statement-breakpoint
CREATE INDEX `operations_tasks_key_created_idx` ON `operations_tasks` (`task_key`,`created_at`);
--> statement-breakpoint
CREATE INDEX `operations_tasks_status_updated_idx` ON `operations_tasks` (`status`,`updated_at`);
