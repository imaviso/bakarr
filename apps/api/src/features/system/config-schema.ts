import { Schema } from "effect";
import {
  ConfigSchema as SharedConfigSchema,
  DownloadsConfigSchema,
  GeneralConfigSchema,
  LibraryConfigSchema,
  NyaaConfigSchema,
  QbittorrentConfigSchema,
  QualityProfileSchema,
  ReleaseProfileRuleSchema,
  ReleaseProfileSchema,
  RemotePathMappingSchema,
  SchedulerConfigSchema,
  StringListSchema,
} from "../../../../../packages/shared/src/index.ts";

export {
  DownloadsConfigSchema,
  GeneralConfigSchema,
  LibraryConfigSchema,
  NyaaConfigSchema,
  QbittorrentConfigSchema,
  QualityProfileSchema,
  ReleaseProfileRuleSchema,
  ReleaseProfileSchema,
  RemotePathMappingSchema,
  SchedulerConfigSchema,
  StringListSchema,
};

export const NumberListSchema = Schema.Array(Schema.Number.pipe(Schema.int()));

export const ReleaseProfileRulesSchema = Schema.Array(ReleaseProfileRuleSchema);

export const CreateReleaseProfileSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: ReleaseProfileRulesSchema,
});

export const UpdateReleaseProfileSchema = Schema.Struct({
  enabled: Schema.Boolean,
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: ReleaseProfileRulesSchema,
});

export const ConfigCoreSchema = Schema.Struct({
  downloads: DownloadsConfigSchema,
  general: GeneralConfigSchema,
  library: LibraryConfigSchema,
  nyaa: NyaaConfigSchema,
  qbittorrent: QbittorrentConfigSchema,
  scheduler: SchedulerConfigSchema,
});

export const ConfigSchema = SharedConfigSchema;
