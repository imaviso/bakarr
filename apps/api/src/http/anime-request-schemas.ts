import { Schema } from "effect";

import {
  AnimeIdFromStringSchema,
  EpisodeNumberFromStringSchema,
  EpisodeNumberSchema,
  NonNegativeIntFromStringSchema,
  PositiveIntFromStringSchema,
  ReleaseProfileIdSchema,
} from "../lib/domain-schema.ts";
import { AbsoluteFilesystemPathStringSchema } from "./common-request-schemas.ts";
export { AddAnimeInput as AddAnimeInputSchema } from "../features/anime/add-anime-input.ts";

const ReleaseProfileIdArraySchema = Schema.Array(ReleaseProfileIdSchema);

const NonEmptyStringSchema = Schema.String.pipe(Schema.minLength(1));
const SearchStringSchema = NonEmptyStringSchema;

export class MonitoredBodySchema extends Schema.Class<MonitoredBodySchema>("MonitoredBodySchema")({
  monitored: Schema.Boolean,
}) {}

export class PathBodySchema extends Schema.Class<PathBodySchema>("PathBodySchema")({
  path: AbsoluteFilesystemPathStringSchema,
}) {}

export class ProfileNameBodySchema extends Schema.Class<ProfileNameBodySchema>(
  "ProfileNameBodySchema",
)({
  profile_name: NonEmptyStringSchema,
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
  q: Schema.optional(SearchStringSchema),
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
  sig: Schema.String.pipe(Schema.minLength(1)),
}) {}

class StreamUrlQuerySchema extends Schema.Class<StreamUrlQuerySchema>("StreamUrlQuerySchema")({
  episodeNumber: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
}) {}

export { StreamQuerySchema, StreamUrlQuerySchema };
