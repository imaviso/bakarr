import { Schema } from "effect";

import {
  AnimeIdFromStringSchema,
  EpisodeNumberFromStringSchema,
  EpisodeNumberSchema,
  NonNegativeIntFromStringSchema,
  PositiveIntFromStringSchema,
  ReleaseProfileIdSchema,
} from "@/domain/domain-schema.ts";
import { AbsoluteFilesystemPathStringSchema } from "@/http/shared/common-request-schemas.ts";
import { AnimeSeasonSchema, OperationTaskKeySchema } from "@packages/shared/index.ts";
export { AddAnimeInput as AddAnimeInputSchema } from "@/features/anime/add-anime-input.ts";

const ReleaseProfileIdArraySchema = Schema.Array(ReleaseProfileIdSchema);

const ProfileNameStringSchema = Schema.String.pipe(Schema.minLength(1));
const AnimeSearchQueryStringSchema = Schema.String.pipe(Schema.minLength(1));
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

const BulkEpisodeMappingItemSchema = Schema.Struct({
  episode_number: EpisodeNumberSchema,
  file_path: AbsoluteFilesystemPathStringSchema,
});

export class BulkEpisodeMappingsBodySchema extends Schema.Class<BulkEpisodeMappingsBodySchema>(
  "BulkEpisodeMappingsBodySchema",
)({
  mappings: Schema.Array(BulkEpisodeMappingItemSchema),
}) {}

export class SearchAnimeQuerySchema extends Schema.Class<SearchAnimeQuerySchema>(
  "SearchAnimeQuerySchema",
)({
  q: Schema.optional(AnimeSearchQueryStringSchema),
}) {}

export class ListAnimeQuerySchema extends Schema.Class<ListAnimeQuerySchema>(
  "ListAnimeQuerySchema",
)({
  limit: Schema.optional(PositiveIntFromStringSchema.pipe(Schema.lessThanOrEqualTo(500))),
  offset: Schema.optional(NonNegativeIntFromStringSchema),
  monitored: Schema.optional(Schema.BooleanFromString),
}) {}

export class AnimeEpisodeParamsSchema extends Schema.Class<AnimeEpisodeParamsSchema>(
  "AnimeEpisodeParamsSchema",
)({
  episodeNumber: EpisodeNumberFromStringSchema,
  id: AnimeIdFromStringSchema,
}) {}

class StreamQuerySchema extends Schema.Class<StreamQuerySchema>("StreamQuerySchema")({
  exp: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
  sig: StreamSignatureStringSchema,
}) {}

class StreamUrlQuerySchema extends Schema.Class<StreamUrlQuerySchema>("StreamUrlQuerySchema")({
  episodeNumber: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
}) {}

export { StreamQuerySchema, StreamUrlQuerySchema };

export class SeasonalAnimeQuerySchema extends Schema.Class<SeasonalAnimeQuerySchema>(
  "SeasonalAnimeQuerySchema",
)({
  season: Schema.optional(AnimeSeasonSchema),
  year: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1970, 2100))),
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 50))),
  page: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.positive())),
}) {}

export class OperationsTaskIdParamsSchema extends Schema.Class<OperationsTaskIdParamsSchema>(
  "OperationsTaskIdParamsSchema",
)({
  taskId: PositiveIntFromStringSchema,
}) {}

export class AnimeOperationsTaskIdParamsSchema extends Schema.Class<AnimeOperationsTaskIdParamsSchema>(
  "AnimeOperationsTaskIdParamsSchema",
)({
  id: AnimeIdFromStringSchema,
  taskId: PositiveIntFromStringSchema,
}) {}

export class OperationsTaskQuerySchema extends Schema.Class<OperationsTaskQuerySchema>(
  "OperationsTaskQuerySchema",
)({
  anime_id: Schema.optional(PositiveIntFromStringSchema),
  task_key: Schema.optional(OperationTaskKeySchema),
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 500))),
  offset: Schema.optional(NonNegativeIntFromStringSchema),
}) {}
