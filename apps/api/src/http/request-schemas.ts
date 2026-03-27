import { Schema } from "effect";
import { DownloadSourceMetadataSchema } from "../../../../packages/shared/src/index.ts";
export { AddAnimeInput as AddAnimeInputSchema } from "../features/anime/add-anime-input.ts";
import {
  AnimeIdFromStringSchema,
  AnimeIdSchema,
  DownloadIdFromStringSchema,
  EpisodeNumberFromStringSchema,
  EpisodeNumberSchema,
  NonNegativeIntFromStringSchema,
  PositiveIntFromStringSchema,
  ReleaseProfileIdSchema,
} from "../lib/domain-schema.ts";
export {
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  UpdateReleaseProfileSchema,
} from "../features/system/config-schema.ts";

const ReleaseProfileIdArraySchema = Schema.Array(ReleaseProfileIdSchema);

const NonEmptyStringSchema = Schema.String.pipe(Schema.minLength(1));
const PathStringSchema = NonEmptyStringSchema;
const UrlStringSchema = NonEmptyStringSchema;
const IsoDateTimeStringSchema = NonEmptyStringSchema;
const SystemLogLevelSchema = Schema.Literal("error", "info", "success", "warn");
const SearchStringSchema = NonEmptyStringSchema;

export class MonitoredBodySchema extends Schema.Class<MonitoredBodySchema>("MonitoredBodySchema")({
  monitored: Schema.Boolean,
}) {}

export class PathBodySchema extends Schema.Class<PathBodySchema>("PathBodySchema")({
  path: PathStringSchema,
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
  file_path: PathStringSchema,
}) {}

class BulkEpisodeMappingItem extends Schema.Class<BulkEpisodeMappingItem>("BulkEpisodeMappingItem")(
  {
    episode_number: EpisodeNumberSchema,
    file_path: PathStringSchema,
  },
) {}

export class BulkEpisodeMappingsBodySchema extends Schema.Class<BulkEpisodeMappingsBodySchema>(
  "BulkEpisodeMappingsBodySchema",
)({
  mappings: Schema.Array(BulkEpisodeMappingItem),
}) {}

export class SearchDownloadBodySchema extends Schema.Class<SearchDownloadBodySchema>(
  "SearchDownloadBodySchema",
)({
  anime_id: AnimeIdSchema,
  decision_reason: Schema.optional(NonEmptyStringSchema),
  episode_number: Schema.optional(EpisodeNumberSchema),
  group: Schema.optional(NonEmptyStringSchema),
  info_hash: Schema.optional(NonEmptyStringSchema),
  is_batch: Schema.optional(Schema.Boolean),
  magnet: UrlStringSchema,
  release_metadata: Schema.optional(DownloadSourceMetadataSchema),
  title: NonEmptyStringSchema,
}) {}

export class SearchMissingBodySchema extends Schema.Class<SearchMissingBodySchema>(
  "SearchMissingBodySchema",
)({
  anime_id: Schema.optional(AnimeIdSchema),
}) {}

export class AddRssFeedBodySchema extends Schema.Class<AddRssFeedBodySchema>(
  "AddRssFeedBodySchema",
)({
  anime_id: AnimeIdSchema,
  name: Schema.optional(NonEmptyStringSchema),
  url: UrlStringSchema,
}) {}

export class EnabledBodySchema extends Schema.Class<EnabledBodySchema>("EnabledBodySchema")({
  enabled: Schema.Boolean,
}) {}

export class ImportUnmappedFolderBodySchema extends Schema.Class<ImportUnmappedFolderBodySchema>(
  "ImportUnmappedFolderBodySchema",
)({
  anime_id: AnimeIdSchema,
  folder_name: PathStringSchema,
  profile_name: Schema.optional(NonEmptyStringSchema),
}) {}

export class ControlUnmappedFolderBodySchema extends Schema.Class<ControlUnmappedFolderBodySchema>(
  "ControlUnmappedFolderBodySchema",
)({
  action: Schema.Literal("pause", "resume", "reset", "refresh"),
  path: PathStringSchema,
}) {}

export class BulkControlUnmappedFoldersBodySchema extends Schema.Class<BulkControlUnmappedFoldersBodySchema>(
  "BulkControlUnmappedFoldersBodySchema",
)({
  action: Schema.Literal("pause_queued", "resume_paused", "reset_failed", "retry_failed"),
}) {}

export class ScanImportPathBodySchema extends Schema.Class<ScanImportPathBodySchema>(
  "ScanImportPathBodySchema",
)({
  anime_id: Schema.optional(AnimeIdSchema),
  path: PathStringSchema,
}) {}

class ImportFilesItem extends Schema.Class<ImportFilesItem>("ImportFilesItem")({
  anime_id: AnimeIdSchema,
  episode_number: EpisodeNumberSchema,
  episode_numbers: Schema.optional(Schema.Array(EpisodeNumberSchema)),
  season: Schema.optional(Schema.Number),
  source_metadata: Schema.optional(DownloadSourceMetadataSchema),
  source_path: PathStringSchema,
}) {}

export class ImportFilesBodySchema extends Schema.Class<ImportFilesBodySchema>(
  "ImportFilesBodySchema",
)({
  files: Schema.Array(ImportFilesItem),
}) {}

export class IdParamsSchema extends Schema.Class<IdParamsSchema>("IdParamsSchema")({
  id: PositiveIntFromStringSchema,
}) {}

export class NameParamsSchema extends Schema.Class<NameParamsSchema>("NameParamsSchema")({
  name: NonEmptyStringSchema,
}) {}

export class AnimeEpisodeParamsSchema extends Schema.Class<AnimeEpisodeParamsSchema>(
  "AnimeEpisodeParamsSchema",
)({
  episodeNumber: EpisodeNumberFromStringSchema,
  id: AnimeIdFromStringSchema,
}) {}

export class SearchEpisodeParamsSchema extends Schema.Class<SearchEpisodeParamsSchema>(
  "SearchEpisodeParamsSchema",
)({
  animeId: AnimeIdFromStringSchema,
  episodeNumber: EpisodeNumberFromStringSchema,
}) {}

export class SystemLogsQuerySchema extends Schema.Class<SystemLogsQuerySchema>(
  "SystemLogsQuerySchema",
)({
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(NonEmptyStringSchema),
  level: Schema.optional(SystemLogLevelSchema),
  page: Schema.optional(PositiveIntFromStringSchema),
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

export class DownloadEventsQuerySchema extends Schema.Class<DownloadEventsQuerySchema>(
  "DownloadEventsQuerySchema",
)({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  cursor: Schema.optional(NonEmptyStringSchema),
  download_id: Schema.optional(DownloadIdFromStringSchema),
  direction: Schema.optional(Schema.Literal("next", "prev")),
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(NonEmptyStringSchema),
  limit: Schema.optional(PositiveIntFromStringSchema),
  start_date: Schema.optional(IsoDateTimeStringSchema),
  status: Schema.optional(NonEmptyStringSchema),
}) {}

export class DownloadEventsExportQuerySchema extends Schema.Class<DownloadEventsExportQuerySchema>(
  "DownloadEventsExportQuerySchema",
)({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  download_id: Schema.optional(DownloadIdFromStringSchema),
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(NonEmptyStringSchema),
  format: Schema.optional(Schema.Literal("csv", "json")),
  limit: Schema.optional(PositiveIntFromStringSchema),
  order: Schema.optional(Schema.Literal("asc", "desc")),
  start_date: Schema.optional(IsoDateTimeStringSchema),
  status: Schema.optional(NonEmptyStringSchema),
}) {}

export class WantedMissingQuerySchema extends Schema.Class<WantedMissingQuerySchema>(
  "WantedMissingQuerySchema",
)({
  limit: Schema.optional(PositiveIntFromStringSchema),
}) {}

export class CalendarQuerySchema extends Schema.Class<CalendarQuerySchema>("CalendarQuerySchema")({
  end: Schema.optional(IsoDateTimeStringSchema),
  start: Schema.optional(IsoDateTimeStringSchema),
}) {}

export class SearchReleasesQuerySchema extends Schema.Class<SearchReleasesQuerySchema>(
  "SearchReleasesQuerySchema",
)({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  category: Schema.optional(NonEmptyStringSchema),
  filter: Schema.optional(NonEmptyStringSchema),
  query: Schema.optional(SearchStringSchema),
}) {}

export class BrowseQuerySchema extends Schema.Class<BrowseQuerySchema>("BrowseQuerySchema")({
  limit: Schema.optional(PositiveIntFromStringSchema),
  offset: Schema.optional(NonNegativeIntFromStringSchema),
  path: Schema.optional(PathStringSchema),
}) {}

export class DeleteDownloadQuerySchema extends Schema.Class<DeleteDownloadQuerySchema>(
  "DeleteDownloadQuerySchema",
)({
  delete_files: Schema.optional(Schema.Literal("false", "true")),
}) {}
