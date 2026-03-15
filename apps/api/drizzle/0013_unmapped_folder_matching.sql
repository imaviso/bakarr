ALTER TABLE `background_jobs` ADD `progress_current` integer;--> statement-breakpoint
ALTER TABLE `background_jobs` ADD `progress_total` integer;--> statement-breakpoint

CREATE TABLE `unmapped_folder_matches` (
  `path` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `size` integer NOT NULL DEFAULT 0,
  `match_status` text NOT NULL DEFAULT 'pending',
  `suggested_matches` text NOT NULL DEFAULT '[]',
  `last_matched_at` text,
  `last_match_error` text,
  `updated_at` text NOT NULL
);
