import { Schema } from "effect";

import {
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
} from "../features/system/config-schema.ts";
import { IsoDateTimeStringSchema } from "./common-request-schemas.ts";

const NonEmptyStringSchema = Schema.String.pipe(Schema.minLength(1));
const SystemLogLevelSchema = Schema.Literal("error", "info", "success", "warn");

export {
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
};

export class NameParamsSchema extends Schema.Class<NameParamsSchema>("NameParamsSchema")({
  name: NonEmptyStringSchema,
}) {}

export class SystemLogsQuerySchema extends Schema.Class<SystemLogsQuerySchema>(
  "SystemLogsQuerySchema",
)({
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(NonEmptyStringSchema),
  level: Schema.optional(SystemLogLevelSchema),
  page: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.positive())),
  start_date: Schema.optional(IsoDateTimeStringSchema),
}) {}

export class SystemLogExportQuerySchema extends Schema.Class<SystemLogExportQuerySchema>(
  "SystemLogExportQuerySchema",
)({
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(NonEmptyStringSchema),
  format: Schema.optional(Schema.Literal("csv", "json")),
  level: Schema.optional(SystemLogLevelSchema),
  start_date: Schema.optional(IsoDateTimeStringSchema),
}) {}
