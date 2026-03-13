import { Schema } from "effect";

export {
  ConfigSchema,
  CreateReleaseProfileSchema,
  QualityProfileSchema,
  ReleaseProfileRuleSchema,
  ReleaseProfileSchema,
  UpdateReleaseProfileSchema,
} from "../features/system/config-schema.ts";

type SearchDownloadBody = {
  anime_id: number;
  episode_number: number;
  group?: string;
  info_hash?: string;
  is_batch?: boolean;
  magnet: string;
  title: string;
};

type AddRssFeedBody = {
  anime_id: number;
  name?: string;
  url: string;
};

type ImportUnmappedFolderBody = {
  anime_id: number;
  folder_name: string;
  profile_name?: string;
};

const PositiveIntFromString = Schema.NumberFromString.pipe(
  Schema.int(),
  Schema.greaterThan(0),
);

const NumberArray = Schema.Array(Schema.Number);

export const LoginRequestSchema = Schema.Struct({
  password: Schema.String,
  username: Schema.String,
});

export const ApiKeyLoginRequestSchema = Schema.Struct({
  api_key: Schema.String,
});

export const ChangePasswordRequestSchema = Schema.Struct({
  current_password: Schema.String,
  new_password: Schema.String,
});

export const AddAnimeInputSchema = Schema.Struct({
  id: Schema.Number,
  monitor_and_search: Schema.Boolean,
  monitored: Schema.Boolean,
  profile_name: Schema.String,
  release_profile_ids: NumberArray,
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
  release_profile_ids: NumberArray,
});

export const FilePathBodySchema = Schema.Struct({
  file_path: Schema.String,
});

export const BulkEpisodeMappingsBodySchema = Schema.Struct({
  mappings: Schema.Array(Schema.Struct({
    episode_number: Schema.Number,
    file_path: Schema.String,
  })),
});

export const SearchDownloadBodySchema: Schema.Schema<SearchDownloadBody> =
  Schema.Struct({
    anime_id: Schema.Number,
    episode_number: Schema.Number,
    group: Schema.optional(Schema.String),
    info_hash: Schema.optional(Schema.String),
    is_batch: Schema.optional(Schema.Boolean),
    magnet: Schema.String,
    title: Schema.String,
  });

export const SearchMissingBodySchema = Schema.Struct({
  anime_id: Schema.optional(Schema.Number),
});

export const AddRssFeedBodySchema: Schema.Schema<AddRssFeedBody> = Schema
  .Struct({
    anime_id: Schema.Number,
    name: Schema.optional(Schema.String),
    url: Schema.String,
  });

export const EnabledBodySchema = Schema.Struct({
  enabled: Schema.Boolean,
});

export const ImportUnmappedFolderBodySchema: Schema.Schema<
  ImportUnmappedFolderBody
> = Schema.Struct({
  anime_id: Schema.Number,
  folder_name: Schema.String,
  profile_name: Schema.optional(Schema.String),
});

export const ScanImportPathBodySchema = Schema.Struct({
  anime_id: Schema.optional(Schema.Number),
  path: Schema.String,
});

export const ImportFilesBodySchema = Schema.Struct({
  files: Schema.Array(Schema.Struct({
    anime_id: Schema.Number,
    episode_number: Schema.Number,
    season: Schema.optional(Schema.Number),
    source_path: Schema.String,
  })),
});

export const IdParamsSchema = Schema.Struct({
  id: PositiveIntFromString,
});

export const NameParamsSchema = Schema.Struct({
  name: Schema.String,
});

export const AnimeEpisodeParamsSchema = Schema.Struct({
  episodeNumber: PositiveIntFromString,
  id: PositiveIntFromString,
});

export const SearchEpisodeParamsSchema = Schema.Struct({
  animeId: PositiveIntFromString,
  episodeNumber: PositiveIntFromString,
});

export const SystemLogsQuerySchema = Schema.Struct({
  end_date: Schema.optional(Schema.String),
  event_type: Schema.optional(Schema.String),
  level: Schema.optional(Schema.String),
  page: Schema.optional(PositiveIntFromString),
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

export const StreamQuerySchema = Schema.Struct({
  token: Schema.optional(Schema.String),
});

export const DownloadEventsQuerySchema = Schema.Struct({
  anime_id: Schema.optional(PositiveIntFromString),
  download_id: Schema.optional(PositiveIntFromString),
  event_type: Schema.optional(Schema.String),
  limit: Schema.optional(PositiveIntFromString),
});

export const WantedMissingQuerySchema = Schema.Struct({
  limit: Schema.optional(PositiveIntFromString),
});

export const CalendarQuerySchema = Schema.Struct({
  end: Schema.optional(Schema.String),
  start: Schema.optional(Schema.String),
});

export const SearchReleasesQuerySchema = Schema.Struct({
  anime_id: Schema.optional(PositiveIntFromString),
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
