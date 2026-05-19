CREATE INDEX IF NOT EXISTS `media_monitored_unit_count_idx` ON `media` (`monitored`, `unit_count`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_units_downloaded_idx` ON `media_units` (`downloaded`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_units_media_downloaded_number_idx` ON `media_units` (`media_id`, `downloaded`, `number`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_units_media_file_path_idx` ON `media_units` (`media_id`, `file_path`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `downloads_status_id_idx` ON `downloads` (`status`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `download_events_media_id_id_idx` ON `download_events` (`media_id`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `download_events_download_id_id_idx` ON `download_events` (`download_id`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `download_events_event_type_id_idx` ON `download_events` (`event_type`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `download_events_created_at_id_idx` ON `download_events` (`created_at`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `download_events_from_status_id_idx` ON `download_events` (`from_status`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `download_events_to_status_id_idx` ON `download_events` (`to_status`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_logs_event_type_id_idx` ON `system_logs` (`event_type`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_logs_level_id_idx` ON `system_logs` (`level`, `id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_logs_created_at_id_idx` ON `system_logs` (`created_at`, `id`);
