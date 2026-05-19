CREATE INDEX IF NOT EXISTS `media_kind_idx` ON `media` (`media_kind`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_profile_name_idx` ON `media` (`profile_name`);
--> statement-breakpoint
DROP INDEX IF EXISTS `system_logs_event_type_id_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `system_logs_level_id_idx`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_logs_event_type_created_at_idx` ON `system_logs` (`event_type`, `created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `system_logs_level_created_at_idx` ON `system_logs` (`level`, `created_at`);
