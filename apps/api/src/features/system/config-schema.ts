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

export class CreateReleaseProfileSchema extends Schema.Class<CreateReleaseProfileSchema>(
  "CreateReleaseProfileSchema",
)({
  enabled: Schema.optional(Schema.Boolean),
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: ReleaseProfileRulesSchema,
}) {}

export class UpdateReleaseProfileSchema extends Schema.Class<UpdateReleaseProfileSchema>(
  "UpdateReleaseProfileSchema",
)({
  enabled: Schema.Boolean,
  is_global: Schema.Boolean,
  name: Schema.String,
  rules: ReleaseProfileRulesSchema,
}) {}

export class ConfigCoreSchema extends Schema.Class<ConfigCoreSchema>("ConfigCoreSchema")({
  downloads: DownloadsConfigSchema,
  general: GeneralConfigSchema,
  library: LibraryConfigSchema,
  nyaa: NyaaConfigSchema,
  qbittorrent: QbittorrentConfigSchema,
  scheduler: SchedulerConfigSchema,
}) {}

export const ConfigSchema = SharedConfigSchema;
