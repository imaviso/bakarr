ALTER TABLE `downloads` ADD `retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `downloads` ADD `last_error_at` text;--> statement-breakpoint
ALTER TABLE `downloads` ADD `reconciled_at` text;