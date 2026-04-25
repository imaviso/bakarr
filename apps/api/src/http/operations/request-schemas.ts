import { Schema } from "effect";

import {
  SEARCH_RELEASE_CATEGORY_OPTIONS,
  SEARCH_RELEASE_FILTER_OPTIONS,
  DownloadSourceMetadataSchema,
  ImportFileSelectionSchema,
  ScannedFileSchema,
  SearchDownloadReleaseContextSchema,
} from "@packages/shared/index.ts";
import {
  AnimeIdFromStringSchema,
  AnimeIdSchema,
  DownloadIdFromStringSchema,
  EpisodeNumberSchema,
  NonNegativeIntFromStringSchema,
  PositiveIntSchema,
  PositiveIntFromStringSchema,
} from "@/domain/domain-schema.ts";
import {
  AbsoluteFilesystemPathStringSchema,
  HttpUrlStringSchema,
  IsoDateTimeStringSchema,
} from "@/http/shared/common-request-schemas.ts";

const RssFeedNameStringSchema = Schema.String.pipe(Schema.minLength(1));
const ProfileNameStringSchema = Schema.String.pipe(Schema.minLength(1));
const SearchQueryStringSchema = Schema.String.pipe(Schema.minLength(1));
const SearchCategoryStringSchema = Schema.Literal(...SEARCH_RELEASE_CATEGORY_OPTIONS);
const SearchFilterStringSchema = Schema.Literal(...SEARCH_RELEASE_FILTER_OPTIONS);
const DownloadCursorStringSchema = Schema.String.pipe(Schema.minLength(1));
const DownloadEventTypeStringSchema = Schema.String.pipe(Schema.minLength(1));
const DownloadEventStatusStringSchema = Schema.String.pipe(Schema.minLength(1));
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

export type DownloadEventsQueryInput = Schema.Schema.Type<typeof DownloadEventsQuerySchema>;
export type DownloadEventsExportQueryInput = Schema.Schema.Type<
  typeof DownloadEventsExportQuerySchema
>;

export interface DownloadEventsQueryParams {
  readonly animeId?: number;
  readonly cursor?: string;
  readonly direction?: "next" | "prev";
  readonly downloadId?: number;
  readonly endDate?: string;
  readonly eventType?: string;
  readonly limit?: number;
  readonly startDate?: string;
  readonly status?: string;
}

export interface DownloadEventsExportQueryParams {
  readonly animeId?: number;
  readonly downloadId?: number;
  readonly endDate?: string;
  readonly eventType?: string;
  readonly limit?: number;
  readonly order?: "asc" | "desc";
  readonly startDate?: string;
  readonly status?: string;
}

export function toDownloadEventsQueryParams(query: DownloadEventsQueryInput) {
  return {
    ...(query.anime_id === undefined ? {} : { animeId: query.anime_id }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.direction === undefined ? {} : { direction: query.direction }),
    ...(query.download_id === undefined ? {} : { downloadId: query.download_id }),
    ...(query.end_date === undefined ? {} : { endDate: query.end_date }),
    ...(query.event_type === undefined ? {} : { eventType: query.event_type }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
    ...(query.start_date === undefined ? {} : { startDate: query.start_date }),
    ...(query.status === undefined ? {} : { status: query.status }),
  } satisfies DownloadEventsQueryParams;
}

export function toDownloadEventsExportQueryParams(query: DownloadEventsExportQueryInput) {
  return {
    ...(query.anime_id === undefined ? {} : { animeId: query.anime_id }),
    ...(query.download_id === undefined ? {} : { downloadId: query.download_id }),
    ...(query.end_date === undefined ? {} : { endDate: query.end_date }),
    ...(query.event_type === undefined ? {} : { eventType: query.event_type }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
    ...(query.order === undefined ? {} : { order: query.order }),
    ...(query.start_date === undefined ? {} : { startDate: query.start_date }),
    ...(query.status === undefined ? {} : { status: query.status }),
  } satisfies DownloadEventsExportQueryParams;
}

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

export class ImportCandidateSelectionBodySchema extends Schema.Class<ImportCandidateSelectionBodySchema>(
  "ImportCandidateSelectionBodySchema",
)({
  candidate_id: AnimeIdSchema,
  candidate_title: Schema.String,
  force_select: Schema.optional(Schema.Boolean),
  files: Schema.mutable(Schema.Array(ScannedFileSchema)),
  selected_candidate_ids: Schema.mutable(Schema.Array(AnimeIdSchema)),
  selected_files: Schema.mutable(Schema.Array(ImportFileSelectionSchema)),
}) {}

export class SearchDownloadBodySchema extends Schema.Class<SearchDownloadBodySchema>(
  "SearchDownloadBodySchema",
)({
  anime_id: AnimeIdSchema,
  episode_number: Schema.optional(EpisodeNumberSchema),
  is_batch: Schema.optional(Schema.Boolean),
  magnet: MagnetLinkStringSchema,
  release_context: Schema.optional(SearchDownloadReleaseContextSchema),
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
