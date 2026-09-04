// Shared operations task wire contracts.
import { Schema } from "effect";
import { OperationTaskIdSchema, type OperationTaskId, MediaIdSchema, type MediaId } from "./ids.ts";

export const OPERATION_TASK_KEY_VALUES = [
  "media_scan_folder",
  "library_import",
  "downloads_search_missing_manual",
  "media_refresh_units_manual",
  "downloads_sync_manual",
  "system_task_scan_manual",
  "system_task_rss_manual",
  "system_task_metadata_refresh_manual",
  "unmapped_scan_manual",
] as const;
export type OperationTaskKey = (typeof OPERATION_TASK_KEY_VALUES)[number];
export const OperationTaskKeySchema = Schema.Literals([...OPERATION_TASK_KEY_VALUES]);

export const OPERATION_TASK_STATUS_VALUES = ["queued", "running", "succeeded", "failed"] as const;
export type OperationTaskStatus = (typeof OPERATION_TASK_STATUS_VALUES)[number];
export const OperationTaskStatusSchema = Schema.Literals([...OPERATION_TASK_STATUS_VALUES]);

export interface OperationTaskPayload {
  media_id?: MediaId | undefined;
  error?: string | undefined;
  imported?: number | undefined;
  failed?: number | undefined;
  found?: number | undefined;
  total?: number | undefined;
}

export const OperationTaskPayloadSchema = Schema.Struct({
  media_id: Schema.optional(MediaIdSchema),
  error: Schema.optional(Schema.String),
  imported: Schema.optional(Schema.Number),
  failed: Schema.optional(Schema.Number),
  found: Schema.optional(Schema.Number),
  total: Schema.optional(Schema.Number),
});

export interface OperationTask {
  id: OperationTaskId;
  task_key: OperationTaskKey;
  status: OperationTaskStatus;
  progress_current?: number | null | undefined;
  progress_total?: number | null | undefined;
  message?: string | null | undefined;
  created_at: string;
  started_at?: string | null | undefined;
  finished_at?: string | null | undefined;
  updated_at: string;
  media_id?: MediaId | null | undefined;
  payload?: OperationTaskPayload | undefined;
}

// v4 HTTP JSON encodes absent optionals as null, so optional fields are NullishOr.
export const OperationTaskSchema = Schema.Struct({
  id: OperationTaskIdSchema,
  task_key: OperationTaskKeySchema,
  status: OperationTaskStatusSchema,
  progress_current: Schema.optional(Schema.NullishOr(Schema.Number)),
  progress_total: Schema.optional(Schema.NullishOr(Schema.Number)),
  message: Schema.optional(Schema.NullishOr(Schema.String)),
  created_at: Schema.String,
  started_at: Schema.optional(Schema.NullishOr(Schema.String)),
  finished_at: Schema.optional(Schema.NullishOr(Schema.String)),
  updated_at: Schema.String,
  media_id: Schema.optional(Schema.NullishOr(MediaIdSchema)),
  payload: Schema.optional(OperationTaskPayloadSchema),
});

export interface AsyncOperationAccepted {
  accepted_at: string;
  message: string;
  status: "queued";
  task_key: OperationTaskKey;
  task_id: OperationTaskId;
}

export const AsyncOperationAcceptedSchema = Schema.Struct({
  accepted_at: Schema.String,
  message: Schema.String,
  status: Schema.Literal("queued"),
  task_key: OperationTaskKeySchema,
  task_id: OperationTaskIdSchema,
});
