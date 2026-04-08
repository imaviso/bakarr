import { Schema } from "effect";

import {
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
} from "@/features/system/config-schema.ts";
import { IsoDateTimeStringSchema } from "@/http/common-request-schemas.ts";

const ResourceNameStringSchema = Schema.String.pipe(Schema.minLength(1));
const SystemLogEventTypeStringSchema = Schema.String.pipe(Schema.minLength(1));
const SystemLogExportEventTypeStringSchema = Schema.String.pipe(Schema.minLength(1));
const SystemLogLevelSchema = Schema.Literal("error", "info", "success", "warn");

export {
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
};

export class NameParamsSchema extends Schema.Class<NameParamsSchema>("NameParamsSchema")({
  name: ResourceNameStringSchema,
}) {}

export class SystemLogsQuerySchema extends Schema.Class<SystemLogsQuerySchema>(
  "SystemLogsQuerySchema",
)({
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(SystemLogEventTypeStringSchema),
  level: Schema.optional(SystemLogLevelSchema),
  page: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.positive())),
  start_date: Schema.optional(IsoDateTimeStringSchema),
}) {}

export class SystemLogExportQuerySchema extends Schema.Class<SystemLogExportQuerySchema>(
  "SystemLogExportQuerySchema",
)({
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(SystemLogExportEventTypeStringSchema),
  format: Schema.optional(Schema.Literal("csv", "json")),
  level: Schema.optional(SystemLogLevelSchema),
  start_date: Schema.optional(IsoDateTimeStringSchema),
}) {}

export type SystemLogsQueryInput = Schema.Schema.Type<typeof SystemLogsQuerySchema>;
export type SystemLogExportQueryInput = Schema.Schema.Type<typeof SystemLogExportQuerySchema>;

export interface SystemLogsQueryParams {
  readonly endDate?: string;
  readonly eventType?: string;
  readonly level?: string;
  readonly page: number;
  readonly startDate?: string;
}

export interface SystemLogExportQueryParams {
  readonly endDate?: string;
  readonly eventType?: string;
  readonly level?: string;
  readonly startDate?: string;
}

export function toSystemLogsQueryParams(query: SystemLogsQueryInput) {
  return {
    ...(query.end_date === undefined ? {} : { endDate: query.end_date }),
    ...(query.event_type === undefined ? {} : { eventType: query.event_type }),
    ...(query.level === undefined ? {} : { level: query.level }),
    page: query.page ?? 1,
    ...(query.start_date === undefined ? {} : { startDate: query.start_date }),
  } satisfies SystemLogsQueryParams;
}

export function toSystemLogExportQueryParams(query: SystemLogExportQueryInput) {
  return {
    ...(query.end_date === undefined ? {} : { endDate: query.end_date }),
    ...(query.event_type === undefined ? {} : { eventType: query.event_type }),
    ...(query.level === undefined ? {} : { level: query.level }),
    ...(query.start_date === undefined ? {} : { startDate: query.start_date }),
  } satisfies SystemLogExportQueryParams;
}
