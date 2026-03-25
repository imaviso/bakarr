import { Schema } from "effect";
import { DownloadSourceMetadataSchema } from "../../../../packages/shared/src/index.ts";
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

export class AddAnimeInputSchema extends Schema.Class<AddAnimeInputSchema>("AddAnimeInputSchema")({
  id: AnimeIdSchema,
  monitor_and_search: Schema.Boolean,
  monitored: Schema.Boolean,
  profile_name: Schema.String,
  release_profile_ids: ReleaseProfileIdArraySchema,
  root_folder: Schema.String,
  use_existing_root: Schema.optional(Schema.Boolean),
}) {}

export class MonitoredBodySchema extends Schema.Class<MonitoredBodySchema>("MonitoredBodySchema")({
  monitored: Schema.Boolean,
}) {}

export class PathBodySchema extends Schema.Class<PathBodySchema>("PathBodySchema")({
  path: Schema.String,
}) {}

export class ProfileNameBodySchema extends Schema.Class<ProfileNameBodySchema>(
  "ProfileNameBodySchema",
)({
  profile_name: Schema.String,
}) {}

export class ReleaseProfileIdsBodySchema extends Schema.Class<ReleaseProfileIdsBodySchema>(
  "ReleaseProfileIdsBodySchema",
)({
  release_profile_ids: ReleaseProfileIdArraySchema,
}) {}

export class FilePathBodySchema extends Schema.Class<FilePathBodySchema>("FilePathBodySchema")({
  file_path: Schema.String,
}) {}

class BulkEpisodeMappingItem extends Schema.Class<BulkEpisodeMappingItem>("BulkEpisodeMappingItem")(
  {
    episode_number: EpisodeNumberSchema,
    file_path: Schema.String,
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
  decision_reason: Schema.optional(Schema.String),
  episode_number: Schema.optional(EpisodeNumberSchema),
  group: Schema.optional(Schema.String),
  info_hash: Schema.optional(Schema.String),
  is_batch: Schema.optional(Schema.Boolean),
  magnet: Schema.String,
  release_metadata: Schema.optional(DownloadSourceMetadataSchema),
  title: Schema.String,
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
  name: Schema.optional(Schema.String),
  url: Schema.String,
}) {}

export class EnabledBodySchema extends Schema.Class<EnabledBodySchema>("EnabledBodySchema")({
  enabled: Schema.Boolean,
}) {}

export class ImportUnmappedFolderBodySchema extends Schema.Class<ImportUnmappedFolderBodySchema>(
  "ImportUnmappedFolderBodySchema",
)({
  anime_id: AnimeIdSchema,
  folder_name: Schema.String,
  profile_name: Schema.optional(Schema.String),
}) {}

export class ControlUnmappedFolderBodySchema extends Schema.Class<ControlUnmappedFolderBodySchema>(
  "ControlUnmappedFolderBodySchema",
)({
  action: Schema.Literal("pause", "resume", "reset", "refresh"),
  path: Schema.String,
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
  path: Schema.String,
}) {}

class ImportFilesItem extends Schema.Class<ImportFilesItem>("ImportFilesItem")({
  anime_id: AnimeIdSchema,
  episode_number: EpisodeNumberSchema,
  episode_numbers: Schema.optional(Schema.Array(EpisodeNumberSchema)),
  season: Schema.optional(Schema.Number),
  source_metadata: Schema.optional(DownloadSourceMetadataSchema),
  source_path: Schema.String,
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
  name: Schema.String,
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
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  level: Schema.optional(Schema.String),
  page: Schema.optional(PositiveIntFromStringSchema),
  start_date: Schema.optional(Schema.String),
}) {}

export class SystemLogExportQuerySchema extends Schema.Class<SystemLogExportQuerySchema>(
  "SystemLogExportQuerySchema",
)({
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  format: Schema.optional(Schema.Literal("csv", "json")),
  level: Schema.optional(Schema.String),
  start_date: Schema.optional(Schema.String),
}) {}

export class SearchAnimeQuerySchema extends Schema.Class<SearchAnimeQuerySchema>(
  "SearchAnimeQuerySchema",
)({
  q: Schema.optional(Schema.String),
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
  cursor: Schema.optional(Schema.String),
  download_id: Schema.optional(DownloadIdFromStringSchema),
  direction: Schema.optional(Schema.Literal("next", "prev")),
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveIntFromStringSchema),
  start_date: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
}) {}

export class DownloadEventsExportQuerySchema extends Schema.Class<DownloadEventsExportQuerySchema>(
  "DownloadEventsExportQuerySchema",
)({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  download_id: Schema.optional(DownloadIdFromStringSchema),
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  format: Schema.optional(Schema.Literal("csv", "json")),
  limit: Schema.optional(PositiveIntFromStringSchema),
  order: Schema.optional(Schema.Literal("asc", "desc")),
  start_date: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
}) {}

export class WantedMissingQuerySchema extends Schema.Class<WantedMissingQuerySchema>(
  "WantedMissingQuerySchema",
)({
  limit: Schema.optional(PositiveIntFromStringSchema),
}) {}

export class CalendarQuerySchema extends Schema.Class<CalendarQuerySchema>("CalendarQuerySchema")({
  end: Schema.optional(Schema.String),
  start: Schema.optional(Schema.String),
}) {}

export class SearchReleasesQuerySchema extends Schema.Class<SearchReleasesQuerySchema>(
  "SearchReleasesQuerySchema",
)({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  category: Schema.optional(Schema.String),
  filter: Schema.optional(Schema.String),
  query: Schema.optional(Schema.String),
}) {}

export class BrowseQuerySchema extends Schema.Class<BrowseQuerySchema>("BrowseQuerySchema")({
  limit: Schema.optional(PositiveIntFromStringSchema),
  offset: Schema.optional(NonNegativeIntFromStringSchema),
  path: Schema.optional(Schema.String),
}) {}

export class DeleteDownloadQuerySchema extends Schema.Class<DeleteDownloadQuerySchema>(
  "DeleteDownloadQuerySchema",
)({
  delete_files: Schema.optional(Schema.Literal("false", "true")),
}) {}
