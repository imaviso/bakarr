import { Schema } from "effect";

import {
  MediaIdFromStringSchema,
  UnitNumberFromStringSchema,
  UnitNumberSchema,
  NonNegativeIntFromStringSchema,
  PositiveIntFromStringSchema,
  ReleaseProfileIdSchema,
} from "@/domain/domain-schema.ts";
import { AbsoluteFilesystemPathStringSchema } from "@/http/shared/common-request-schemas.ts";
import {
  MediaSeasonSchema,
  MediaKindSchema,
  OperationTaskKeySchema,
} from "@packages/shared/index.ts";
export { AddAnimeInput as AddAnimeInputSchema } from "@/features/media/add/add-media-input.ts";

const ReleaseProfileIdArraySchema = Schema.Array(ReleaseProfileIdSchema);

const ProfileNameStringSchema = Schema.String.pipe(Schema.minLength(1));
const MediaSearchQueryStringSchema = Schema.String.pipe(Schema.minLength(1));
const StreamSignatureStringSchema = Schema.String.pipe(Schema.minLength(1));

export class MonitoredBodySchema extends Schema.Class<MonitoredBodySchema>("MonitoredBodySchema")({
  monitored: Schema.Boolean,
}) {}

export class PathBodySchema extends Schema.Class<PathBodySchema>("PathBodySchema")({
  path: AbsoluteFilesystemPathStringSchema,
}) {}

export class ProfileNameBodySchema extends Schema.Class<ProfileNameBodySchema>(
  "ProfileNameBodySchema",
)({
  profile_name: ProfileNameStringSchema,
}) {}

export class ReleaseProfileIdsBodySchema extends Schema.Class<ReleaseProfileIdsBodySchema>(
  "ReleaseProfileIdsBodySchema",
)({
  release_profile_ids: ReleaseProfileIdArraySchema,
}) {}

export class FilePathBodySchema extends Schema.Class<FilePathBodySchema>("FilePathBodySchema")({
  file_path: AbsoluteFilesystemPathStringSchema,
}) {}

const BulkUnitMappingItemSchema = Schema.Struct({
  unit_number: UnitNumberSchema,
  file_path: AbsoluteFilesystemPathStringSchema,
});

export class BulkUnitMappingsBodySchema extends Schema.Class<BulkUnitMappingsBodySchema>(
  "BulkUnitMappingsBodySchema",
)({
  mappings: Schema.Array(BulkUnitMappingItemSchema),
}) {}

export class SearchMediaQuerySchema extends Schema.Class<SearchMediaQuerySchema>(
  "SearchMediaQuerySchema",
)({
  media_kind: Schema.optional(MediaKindSchema),
  q: Schema.optional(MediaSearchQueryStringSchema),
}) {}

export class ListMediaQuerySchema extends Schema.Class<ListMediaQuerySchema>(
  "ListMediaQuerySchema",
)({
  limit: Schema.optional(PositiveIntFromStringSchema.pipe(Schema.lessThanOrEqualTo(500))),
  offset: Schema.optional(NonNegativeIntFromStringSchema),
  monitored: Schema.optional(Schema.BooleanFromString),
}) {}

export class MediaUnitParamsSchema extends Schema.Class<MediaUnitParamsSchema>(
  "MediaUnitParamsSchema",
)({
  unitNumber: UnitNumberFromStringSchema,
  id: MediaIdFromStringSchema,
}) {}

class StreamQuerySchema extends Schema.Class<StreamQuerySchema>("StreamQuerySchema")({
  exp: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  sig: StreamSignatureStringSchema,
}) {}

class StreamUrlQuerySchema extends Schema.Class<StreamUrlQuerySchema>("StreamUrlQuerySchema")({
  unitNumber: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
}) {}

export { StreamQuerySchema, StreamUrlQuerySchema };

export class SeasonalMediaQuerySchema extends Schema.Class<SeasonalMediaQuerySchema>(
  "SeasonalMediaQuerySchema",
)({
  season: Schema.optional(MediaSeasonSchema),
  year: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1970, 2100))),
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 50))),
  page: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.positive())),
}) {}

export class OperationsTaskIdParamsSchema extends Schema.Class<OperationsTaskIdParamsSchema>(
  "OperationsTaskIdParamsSchema",
)({
  taskId: PositiveIntFromStringSchema,
}) {}

export class MediaOperationsTaskIdParamsSchema extends Schema.Class<MediaOperationsTaskIdParamsSchema>(
  "MediaOperationsTaskIdParamsSchema",
)({
  id: MediaIdFromStringSchema,
  taskId: PositiveIntFromStringSchema,
}) {}

export class OperationsTaskQuerySchema extends Schema.Class<OperationsTaskQuerySchema>(
  "OperationsTaskQuerySchema",
)({
  media_id: Schema.optional(PositiveIntFromStringSchema),
  task_key: Schema.optional(OperationTaskKeySchema),
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 500))),
  offset: Schema.optional(NonNegativeIntFromStringSchema),
}) {}
