import { Schema } from "effect";
import {
  AnimeIdFromStringSchema,
  AnimeIdSchema,
  DownloadIdFromStringSchema,
  EpisodeNumberFromStringSchema,
  EpisodeNumberSchema,
  PositiveIntFromStringSchema,
  ReleaseProfileIdSchema,
} from "../lib/domain-schema.ts";
export {
  ApiKeyLoginRequestSchema,
  ChangePasswordRequestSchema,
  LoginRequestSchema,
} from "../../../../packages/shared/src/index.ts";

export {
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  ReleaseProfileRuleSchema,
  ReleaseProfileSchema,
  UpdateReleaseProfileSchema,
} from "../features/system/config-schema.ts";

const ReleaseProfileIdArraySchema = Schema.Array(ReleaseProfileIdSchema);

export const AddAnimeInputSchema = Schema.Struct({
  id: AnimeIdSchema,
  monitor_and_search: Schema.Boolean,
  monitored: Schema.Boolean,
  profile_name: Schema.String,
  release_profile_ids: ReleaseProfileIdArraySchema,
  root_folder: Schema.String,
});

export const MonitoredBodySchema = Schema.Struct({
  monitored: Schema.Boolean,
});

export const PathBodySchema = Schema.Struct({
  path: Schema.String,
});

export const ProfileNameBodySchema = Schema.Struct({
  profile_name: Schema.String,
});

export const ReleaseProfileIdsBodySchema = Schema.Struct({
  release_profile_ids: ReleaseProfileIdArraySchema,
});

export const FilePathBodySchema = Schema.Struct({
  file_path: Schema.String,
});

export const BulkEpisodeMappingsBodySchema = Schema.Struct({
  mappings: Schema.Array(Schema.Struct({
    episode_number: EpisodeNumberSchema,
    file_path: Schema.String,
  })),
});

export const SearchDownloadBodySchema = Schema.Struct({
  anime_id: AnimeIdSchema,
  episode_number: EpisodeNumberSchema,
  group: Schema.optional(Schema.String),
  info_hash: Schema.optional(Schema.String),
  is_batch: Schema.optional(Schema.Boolean),
  magnet: Schema.String,
  title: Schema.String,
});

export const SearchMissingBodySchema = Schema.Struct({
  anime_id: Schema.optional(AnimeIdSchema),
});

export const AddRssFeedBodySchema = Schema.Struct({
  anime_id: AnimeIdSchema,
  name: Schema.optional(Schema.String),
  url: Schema.String,
});

export const EnabledBodySchema = Schema.Struct({
  enabled: Schema.Boolean,
});

export const ImportUnmappedFolderBodySchema = Schema.Struct({
  anime_id: AnimeIdSchema,
  folder_name: Schema.String,
  profile_name: Schema.optional(Schema.String),
});

export const ScanImportPathBodySchema = Schema.Struct({
  anime_id: Schema.optional(AnimeIdSchema),
  path: Schema.String,
});

export const ImportFilesBodySchema = Schema.Struct({
  files: Schema.Array(Schema.Struct({
    anime_id: AnimeIdSchema,
    episode_number: EpisodeNumberSchema,
    season: Schema.optional(Schema.Number),
    source_path: Schema.String,
  })),
});

export const IdParamsSchema = Schema.Struct({
  id: PositiveIntFromStringSchema,
});

export const NameParamsSchema = Schema.Struct({
  name: Schema.String,
});

export const AnimeEpisodeParamsSchema = Schema.Struct({
  episodeNumber: EpisodeNumberFromStringSchema,
  id: AnimeIdFromStringSchema,
});

export const SearchEpisodeParamsSchema = Schema.Struct({
  animeId: AnimeIdFromStringSchema,
  episodeNumber: EpisodeNumberFromStringSchema,
});

export const SystemLogsQuerySchema = Schema.Struct({
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  level: Schema.optional(Schema.String),
  page: Schema.optional(PositiveIntFromStringSchema),
  start_date: Schema.optional(Schema.String),
});

export const SystemLogExportQuerySchema = Schema.Struct({
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  format: Schema.optional(Schema.Literal("csv", "json")),
  level: Schema.optional(Schema.String),
  start_date: Schema.optional(Schema.String),
});

export const SearchAnimeQuerySchema = Schema.Struct({
  q: Schema.optional(Schema.String),
});

export const DownloadEventsQuerySchema = Schema.Struct({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  download_id: Schema.optional(DownloadIdFromStringSchema),
  event_type: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveIntFromStringSchema),
});

export const WantedMissingQuerySchema = Schema.Struct({
  limit: Schema.optional(PositiveIntFromStringSchema),
});

export const CalendarQuerySchema = Schema.Struct({
  end: Schema.optional(Schema.String),
  start: Schema.optional(Schema.String),
});

export const SearchReleasesQuerySchema = Schema.Struct({
  anime_id: Schema.optional(AnimeIdFromStringSchema),
  category: Schema.optional(Schema.String),
  filter: Schema.optional(Schema.String),
  query: Schema.optional(Schema.String),
});

export const BrowseQuerySchema = Schema.Struct({
  path: Schema.optional(Schema.String),
});

export const DeleteDownloadQuerySchema = Schema.Struct({
  delete_files: Schema.optional(Schema.Literal("false", "true")),
});
