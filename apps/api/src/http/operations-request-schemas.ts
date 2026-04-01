import { Schema } from "effect";

import { DownloadSourceMetadataSchema } from "@packages/shared/index.ts";
import {
  AnimeIdFromStringSchema,
  AnimeIdSchema,
  DownloadIdFromStringSchema,
  EpisodeNumberSchema,
  NonNegativeIntFromStringSchema,
  PositiveIntSchema,
  PositiveIntFromStringSchema,
} from "@/lib/domain-schema.ts";
import {
  AbsoluteFilesystemPathStringSchema,
  HttpUrlStringSchema,
  IsoDateTimeStringSchema,
} from "@/http/common-request-schemas.ts";

const RssFeedNameStringSchema = Schema.String.pipe(Schema.minLength(1));
const ProfileNameStringSchema = Schema.String.pipe(Schema.minLength(1));
const SearchQueryStringSchema = Schema.String.pipe(Schema.minLength(1));
const SearchCategoryStringSchema = Schema.String.pipe(Schema.minLength(1));
const SearchFilterStringSchema = Schema.String.pipe(Schema.minLength(1));
const DownloadCursorStringSchema = Schema.String.pipe(Schema.minLength(1));
const DownloadEventTypeStringSchema = Schema.String.pipe(Schema.minLength(1));
const DownloadEventStatusStringSchema = Schema.String.pipe(Schema.minLength(1));
const DecisionReasonStringSchema = Schema.String.pipe(Schema.minLength(1));
const ReleaseGroupStringSchema = Schema.String.pipe(Schema.minLength(1));
const TorrentInfoHashStringSchema = Schema.String.pipe(Schema.minLength(1));
const MagnetLinkStringSchema = Schema.String.pipe(Schema.minLength(1));
const ReleaseTitleStringSchema = Schema.String.pipe(Schema.minLength(1));

const BrowsePathStringSchema = Schema.Union(
  Schema.Literal("."),
  AbsoluteFilesystemPathStringSchema,
);

const FolderNameStringSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.filter(
    (value) =>
      value !== "." &&
      value !== ".." &&
      !value.includes("/") &&
      !value.includes("\\") &&
      !value.includes("\u0000"),
  ),
);

export class AddRssFeedBodySchema extends Schema.Class<AddRssFeedBodySchema>(
  "AddRssFeedBodySchema",
)({
  anime_id: AnimeIdSchema,
  name: Schema.optional(RssFeedNameStringSchema),
  url: HttpUrlStringSchema,
}) {}

export class BrowseQuerySchema extends Schema.Class<BrowseQuerySchema>("BrowseQuerySchema")({
  limit: Schema.optional(PositiveIntFromStringSchema),
  offset: Schema.optional(NonNegativeIntFromStringSchema),
  path: Schema.optional(BrowsePathStringSchema),
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
  path: AbsoluteFilesystemPathStringSchema,
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
  cursor: Schema.optional(DownloadCursorStringSchema),
  download_id: Schema.optional(DownloadIdFromStringSchema),
  direction: Schema.optional(Schema.Literal("next", "prev")),
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(DownloadEventTypeStringSchema),
  limit: Schema.optional(PositiveIntFromStringSchema),
  start_date: Schema.optional(IsoDateTimeStringSchema),
  status: Schema.optional(DownloadEventStatusStringSchema),
}) {}

export class DownloadEventsExportQuerySchema extends Schema.Class<DownloadEventsExportQuerySchema>(
  "DownloadEventsExportQuerySchema",
)({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  download_id: Schema.optional(DownloadIdFromStringSchema),
  end_date: Schema.optional(IsoDateTimeStringSchema),
  event_type: Schema.optional(DownloadEventTypeStringSchema),
  format: Schema.optional(Schema.Literal("csv", "json")),
  limit: Schema.optional(PositiveIntFromStringSchema),
  order: Schema.optional(Schema.Literal("asc", "desc")),
  start_date: Schema.optional(IsoDateTimeStringSchema),
  status: Schema.optional(DownloadEventStatusStringSchema),
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
  source_path: AbsoluteFilesystemPathStringSchema,
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
  folder_name: FolderNameStringSchema,
  profile_name: Schema.optional(ProfileNameStringSchema),
}) {}

export class ScanImportPathBodySchema extends Schema.Class<ScanImportPathBodySchema>(
  "ScanImportPathBodySchema",
)({
  anime_id: Schema.optional(AnimeIdSchema),
  limit: Schema.optional(PositiveIntSchema),
  path: AbsoluteFilesystemPathStringSchema,
}) {}

export class SearchDownloadBodySchema extends Schema.Class<SearchDownloadBodySchema>(
  "SearchDownloadBodySchema",
)({
  anime_id: AnimeIdSchema,
  decision_reason: Schema.optional(DecisionReasonStringSchema),
  episode_number: Schema.optional(EpisodeNumberSchema),
  group: Schema.optional(ReleaseGroupStringSchema),
  info_hash: Schema.optional(TorrentInfoHashStringSchema),
  is_batch: Schema.optional(Schema.Boolean),
  magnet: MagnetLinkStringSchema,
  release_metadata: Schema.optional(DownloadSourceMetadataSchema),
  title: ReleaseTitleStringSchema,
}) {}

export class SearchReleasesQuerySchema extends Schema.Class<SearchReleasesQuerySchema>(
  "SearchReleasesQuerySchema",
)({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  category: Schema.optional(SearchCategoryStringSchema),
  filter: Schema.optional(SearchFilterStringSchema),
  query: Schema.optional(SearchQueryStringSchema),
}) {}

export class WantedMissingQuerySchema extends Schema.Class<WantedMissingQuerySchema>(
  "WantedMissingQuerySchema",
)({
  limit: Schema.optional(PositiveIntFromStringSchema),
}) {}
