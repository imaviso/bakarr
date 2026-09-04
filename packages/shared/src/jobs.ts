// Shared background job wire contracts.
import { Schema, Struct } from "effect";
import { SystemLogIdSchema, type SystemLogId } from "./ids.ts";

export interface SystemLog {
  id: SystemLogId;
  event_type: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  details?: string | undefined;
  created_at: string;
}

export const SYSTEM_LOG_LEVEL_VALUES = ["info", "warn", "error", "success"] as const;
export type SystemLogLevel = (typeof SYSTEM_LOG_LEVEL_VALUES)[number];
export const SystemLogLevelSchema = Schema.Literals([...SYSTEM_LOG_LEVEL_VALUES]);

export const SystemLogSchema = Schema.Struct({
  id: SystemLogIdSchema,
  event_type: Schema.String,
  level: SystemLogLevelSchema,
  message: Schema.String,
  details: Schema.optional(Schema.String),
  created_at: Schema.String,
});

export interface SystemLogsResponse {
  logs: SystemLog[];
  total_pages: number;
}

export const SystemLogsResponseSchema = Schema.Struct({
  logs: Schema.mutable(Schema.Array(SystemLogSchema)),
  total_pages: Schema.Number,
}).mapFields(Struct.map(Schema.mutableKey));

export interface BackgroundJobStatus {
  name: string;
  is_running: boolean;
  last_run_at?: string | undefined;
  last_success_at?: string | undefined;
  last_status?: string | undefined;
  last_message?: string | undefined;
  progress_current?: number | undefined;
  progress_total?: number | undefined;
  run_count: number;
  schedule_mode?: "cron" | "interval" | "manual" | "disabled" | undefined;
  schedule_value?: string | undefined;
}

export const BACKGROUND_JOB_SCHEDULE_MODE_VALUES = [
  "cron",
  "interval",
  "manual",
  "disabled",
] as const;
export type BackgroundJobScheduleMode = (typeof BACKGROUND_JOB_SCHEDULE_MODE_VALUES)[number];
export const BackgroundJobScheduleModeSchema = Schema.Literals([
  ...BACKGROUND_JOB_SCHEDULE_MODE_VALUES,
]);

export const BackgroundJobStatusSchema = Schema.Struct({
  name: Schema.String,
  is_running: Schema.Boolean,
  last_run_at: Schema.optional(Schema.String),
  last_success_at: Schema.optional(Schema.String),
  last_status: Schema.optional(Schema.String),
  last_message: Schema.optional(Schema.String),
  progress_current: Schema.optional(Schema.Number),
  progress_total: Schema.optional(Schema.Number),
  run_count: Schema.Number,
  schedule_mode: Schema.optional(BackgroundJobScheduleModeSchema),
  schedule_value: Schema.optional(Schema.String),
});
