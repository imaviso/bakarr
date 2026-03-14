import { Schema } from "effect";

import type {
  Config,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
} from "../../../../../packages/shared/src/index.ts";
import { qualityProfiles, releaseProfiles } from "../../db/schema.ts";
import {
  ConfigCoreSchema,
  NumberListSchema,
  ReleaseProfileRulesSchema,
  StringListSchema,
} from "./config-schema.ts";

export type ConfigCore = Omit<Config, "profiles">;

const StringListJsonSchema = Schema.parseJson(StringListSchema);
const NumberListJsonSchema = Schema.parseJson(NumberListSchema);
const ReleaseProfileRulesJsonSchema = Schema.parseJson(
  ReleaseProfileRulesSchema,
);
const ConfigCoreJsonSchema = Schema.parseJson(ConfigCoreSchema);

export function encodeQualityProfileRow(profile: QualityProfile) {
  return {
    allowedQualities: encodeStringList(profile.allowed_qualities),
    cutoff: profile.cutoff,
    maxSize: profile.max_size ?? null,
    minSize: profile.min_size ?? null,
    name: profile.name,
    seadexPreferred: profile.seadex_preferred,
    upgradeAllowed: profile.upgrade_allowed,
  };
}

export function decodeQualityProfileRow(
  row: typeof qualityProfiles.$inferSelect,
): QualityProfile {
  return {
    allowed_qualities: decodeStringList(row.allowedQualities),
    cutoff: row.cutoff,
    max_size: row.maxSize ?? null,
    min_size: row.minSize ?? null,
    name: row.name,
    seadex_preferred: row.seadexPreferred,
    upgrade_allowed: row.upgradeAllowed,
  };
}

export function decodeReleaseProfileRow(
  row: typeof releaseProfiles.$inferSelect,
): ReleaseProfile {
  return {
    enabled: row.enabled,
    id: row.id,
    is_global: row.isGlobal,
    name: row.name,
    rules: decodeReleaseProfileRules(row.rules),
  };
}

export function encodeReleaseProfileRules(
  rules: readonly ReleaseProfileRule[],
) {
  return Schema.encodeSync(ReleaseProfileRulesJsonSchema)(rules.map((rule) => ({
    ...rule,
  })));
}

export function decodeReleaseProfileRules(value: string): ReleaseProfileRule[] {
  return [...Schema.decodeUnknownSync(ReleaseProfileRulesJsonSchema)(value)];
}

export function encodeConfigCore(core: ConfigCore): string {
  return Schema.encodeSync(ConfigCoreJsonSchema)({
    downloads: {
      ...core.downloads,
      preferred_groups: [...core.downloads.preferred_groups],
      remote_path_mappings: core.downloads.remote_path_mappings.map((
        mapping,
      ) => [
        ...mapping,
      ]),
    },
    general: { ...core.general },
    library: { ...core.library },
    nyaa: { ...core.nyaa },
    qbittorrent: { ...core.qbittorrent },
    scheduler: { ...core.scheduler },
  });
}

export function decodeConfigCore(value: string): ConfigCore {
  const decoded = Schema.decodeUnknownSync(ConfigCoreJsonSchema)(value);

  return {
    downloads: {
      ...decoded.downloads,
      preferred_groups: [...decoded.downloads.preferred_groups],
      remote_path_mappings: decoded.downloads.remote_path_mappings.map((
        mapping,
      ) => [
        ...mapping,
      ]),
    },
    general: { ...decoded.general },
    library: { ...decoded.library },
    nyaa: { ...decoded.nyaa },
    qbittorrent: { ...decoded.qbittorrent },
    scheduler: { ...decoded.scheduler },
  };
}

export function tryDecodeConfigCore(
  value: string,
): ConfigCore | null {
  try {
    return decodeConfigCore(value);
  } catch {
    return null;
  }
}

export function encodeStringList(values: readonly string[]) {
  return Schema.encodeSync(StringListJsonSchema)([...values]);
}

export function decodeStringList(value: string): string[] {
  return [...Schema.decodeUnknownSync(StringListJsonSchema)(value)];
}

export function encodeNumberList(values: readonly number[]) {
  return Schema.encodeSync(NumberListJsonSchema)([...values]);
}

export function decodeNumberList(value: string): number[] {
  return [...Schema.decodeUnknownSync(NumberListJsonSchema)(value)];
}

export function encodeOptionalNumberList(
  values: readonly number[],
): string | null {
  const normalized = [
    ...new Set(values.filter((value) => Number.isInteger(value) && value > 0)),
  ]
    .sort((left, right) => left - right);

  return normalized.length > 0 ? encodeNumberList(normalized) : null;
}

export function decodeOptionalNumberList(
  value: string | null | undefined,
): number[] {
  if (!value) {
    return [];
  }

  try {
    return decodeNumberList(value);
  } catch {
    return [];
  }
}
