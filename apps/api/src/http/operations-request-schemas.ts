import { Schema } from "effect";

import { DownloadSourceMetadataSchema } from "../../../../packages/shared/src/index.ts";
import {
  AnimeIdFromStringSchema,
  AnimeIdSchema,
  DownloadIdFromStringSchema,
  EpisodeNumberSchema,
  NonNegativeIntFromStringSchema,
  PositiveIntFromStringSchema,
} from "../lib/domain-schema.ts";

const NonEmptyStringSchema = Schema.String.pipe(Schema.minLength(1));
const PathStringSchema = NonEmptyStringSchema;
const IsoDateTimeStringSchema = NonEmptyStringSchema;
const SearchStringSchema = NonEmptyStringSchema;

export class AddRssFeedBodySchema extends Schema.Class<AddRssFeedBodySchema>(
  "AddRssFeedBodySchema",
)({
  anime_id: AnimeIdSchema,
  name: Schema.optional(NonEmptyStringSchema),
  url: NonEmptyStringSchema,
}) {}

export class BrowseQuerySchema extends Schema.Class<BrowseQuerySchema>("BrowseQuerySchema")({
  limit: Schema.optional(PositiveIntFromStringSchema),
  offset: Schema.optional(NonNegativeIntFromStringSchema),
  path: Schema.optional(PathStringSchema),
}) {}

export class BulkControlUnmappedFoldersBodySchema extends Schema.Class<BulkControlUnmappedFoldersBodySchema>(
  "BulkControlUnmappedFoldersBodySchema",
)({
  action: Schema.Literal("pause_queued", "resume_paused", "reset_failed", "retry_failed"),
}) {}

export class CalendarQuerySchema extends Schema.Class<CalendarQuerySchema>("CalendarQuerySchema")({
  end: Schema.optional(IsoDateTimeStringSchema),
  start: Schema.optional(IsoDateTimeStringSchema),
}) {}

export class ControlUnmappedFolderBodySchema extends Schema.Class<ControlUnmappedFolderBodySchema>(
  "ControlUnmappedFolderBodySchema",
)({
  action: Schema.Literal("pause", "resume", "reset", "refresh"),
  path: PathStringSchema,
}) {}

export class DeleteDownloadQuerySchema extends Schema.Class<DeleteDownloadQuerySchema>(
  "DeleteDownloadQuerySchema",
)({
  delete_files: Schema.optional(Schema.Literal("false", "true")),
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

export class SearchMissingBodySchema extends Schema.Class<SearchMissingBodySchema>(
  "SearchMissingBodySchema",
)({
  anime_id: Schema.optional(AnimeIdSchema),
}) {}

export class EnabledBodySchema extends Schema.Class<EnabledBodySchema>("EnabledBodySchema")({
  enabled: Schema.Boolean,
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

export class ImportUnmappedFolderBodySchema extends Schema.Class<ImportUnmappedFolderBodySchema>(
  "ImportUnmappedFolderBodySchema",
)({
  anime_id: AnimeIdSchema,
  folder_name: PathStringSchema,
  profile_name: Schema.optional(NonEmptyStringSchema),
}) {}

export class ScanImportPathBodySchema extends Schema.Class<ScanImportPathBodySchema>(
  "ScanImportPathBodySchema",
)({
  anime_id: Schema.optional(AnimeIdSchema),
  path: PathStringSchema,
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
  magnet: NonEmptyStringSchema,
  release_metadata: Schema.optional(DownloadSourceMetadataSchema),
  title: NonEmptyStringSchema,
}) {}

export class SearchReleasesQuerySchema extends Schema.Class<SearchReleasesQuerySchema>(
  "SearchReleasesQuerySchema",
)({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  category: Schema.optional(NonEmptyStringSchema),
  filter: Schema.optional(NonEmptyStringSchema),
  query: Schema.optional(SearchStringSchema),
}) {}

export class WantedMissingQuerySchema extends Schema.Class<WantedMissingQuerySchema>(
  "WantedMissingQuerySchema",
)({
  limit: Schema.optional(PositiveIntFromStringSchema),
}) {}
