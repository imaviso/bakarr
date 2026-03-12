ALTER TABLE `downloads` ADD `external_state` text;--> statement-breakpoint
ALTER TABLE `downloads` ADD `error_message` text;--> statement-breakpoint
ALTER TABLE `downloads` ADD `save_path` text;--> statement-breakpoint
ALTER TABLE `downloads` ADD `content_path` text;--> statement-breakpoint
ALTER TABLE `downloads` ADD `total_bytes` integer;--> statement-breakpoint
ALTER TABLE `downloads` ADD `downloaded_bytes` integer;--> statement-breakpoint
ALTER TABLE `downloads` ADD `speed_bytes` integer;--> statement-breakpoint
ALTER TABLE `downloads` ADD `eta_seconds` integer;--> statement-breakpoint
ALTER TABLE `downloads` ADD `last_synced_at` text;