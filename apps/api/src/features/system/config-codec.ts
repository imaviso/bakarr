import { Effect, ParseResult, Schema } from "effect";

import type {
  Config,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
} from "../../../../../packages/shared/src/index.ts";
import { qualityProfiles, releaseProfiles } from "../../db/schema.ts";
import {
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "./errors.ts";
import {
  ConfigCoreSchema,
  NumberListSchema,
  ReleaseProfileRulesSchema,
  StringListSchema,
} from "./config-schema.ts";
import { makeDefaultConfig } from "./defaults.ts";

export type ConfigCore = Omit<Config, "profiles">;

const StringListJsonSchema = Schema.parseJson(StringListSchema);
const NumberListJsonSchema = Schema.parseJson(NumberListSchema);
const ReleaseProfileRulesJsonSchema = Schema.parseJson(
  ReleaseProfileRulesSchema,
);
const UnknownJsonSchema = Schema.parseJson(Schema.Unknown);
const ConfigCoreJsonSchema = Schema.parseJson(ConfigCoreSchema);

function storedConfigCorrupt(message: string, cause?: unknown) {
  const detail = cause && ParseResult.isParseError(cause)
    ? ParseResult.TreeFormatter.formatErrorSync(cause)
    : undefined;

  return new StoredConfigCorruptError({
    message: detail ? `${message}: ${detail}` : message,
  });
}

function parseConfigJson(value: string): unknown {
  return Schema.decodeUnknownSync(UnknownJsonSchema)(value);
}

function cloneConfigCore(decoded: ConfigCore): ConfigCore {
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

export function decodeConfigCoreOrThrow(value: string): ConfigCore {
  try {
    return decodeConfigCore(value);
  } catch (cause) {
    throw storedConfigCorrupt(
      "Stored configuration is corrupt and could not be decoded",
      cause,
    );
  }
}

export function decodeStoredConfigRowOrThrow(
  row: { data: string } | undefined,
): ConfigCore {
  if (!row) {
    throw new StoredConfigMissingError({
      message: "Stored configuration is missing",
    });
  }

  return decodeConfigCoreOrThrow(row.data);
}

export function decodeStoredLibraryConfigOrThrow(
  row: { data: string } | undefined,
): ConfigCore["library"] {
  if (!row) {
    return { ...makeDefaultConfig(":memory:").library };
  }

  const config = decodeConfigCoreOrThrow(row.data);
  return { ...config.library };
}

export function decodeStoredImagePathOrThrow(
  row: { data: string } | undefined,
): string {
  if (!row) {
    return "./data/images";
  }

  const config = decodeConfigCoreOrThrow(row.data);
  return config.general.images_path.trim() || "./data/images";
}

export function decodeQualityProfileRowOrThrow(
  row: typeof qualityProfiles.$inferSelect,
): QualityProfile {
  try {
    return decodeQualityProfileRow(row);
  } catch (cause) {
    throw storedConfigCorrupt(
      "Stored quality profile is corrupt and could not be decoded",
      cause,
    );
  }
}

export function decodeReleaseProfileRulesOrThrow(
  value: string,
): ReleaseProfileRule[] {
  try {
    return decodeReleaseProfileRules(value);
  } catch (cause) {
    throw storedConfigCorrupt(
      "Stored release profile rules are corrupt and could not be decoded",
      cause,
    );
  }
}

export function decodeReleaseProfileRowOrThrow(
  row: typeof releaseProfiles.$inferSelect,
): ReleaseProfile {
  try {
    return decodeReleaseProfileRow(row);
  } catch (cause) {
    throw storedConfigCorrupt(
      "Stored release profile is corrupt and could not be decoded",
      cause,
    );
  }
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
  const decoded = Schema.decodeUnknownSync(ConfigCoreSchema)(
    parseConfigJson(value),
  );

  return cloneConfigCore(decoded);
}

export function encodeStringList(values: readonly string[]) {
  return Schema.encodeSync(StringListJsonSchema)([...values]);
}

export function decodeStringList(value: string): string[] {
  return [...Schema.decodeUnknownSync(StringListJsonSchema)(value)];
}

export function decodeStringListOrThrow(value: string): string[] {
  try {
    return decodeStringList(value);
  } catch (cause) {
    throw storedConfigCorrupt(
      "Stored string list is corrupt and could not be decoded",
      cause,
    );
  }
}

export function encodeNumberList(values: readonly number[]) {
  return Schema.encodeSync(NumberListJsonSchema)([...values]);
}

export function decodeNumberList(value: string): number[] {
  return [...Schema.decodeUnknownSync(NumberListJsonSchema)(value)];
}

export function decodeNumberListOrThrow(value: string): number[] {
  try {
    return decodeNumberList(value);
  } catch (cause) {
    throw storedConfigCorrupt(
      "Stored number list is corrupt and could not be decoded",
      cause,
    );
  }
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

  const decoded = Schema.decodeUnknownEither(NumberListJsonSchema)(value);

  if (decoded._tag === "Left") {
    return [];
  }

  return [...decoded.right];
}

export function decodeOptionalNumberListOrThrow(
  value: string | null | undefined,
): number[] {
  if (!value) {
    return [];
  }

  return [...Schema.decodeUnknownSync(NumberListJsonSchema)(value)];
}

export function effectDecodeStringList(
  value: string,
): Effect.Effect<string[], StoredConfigCorruptError> {
  return Schema.decodeUnknown(StringListJsonSchema)(value).pipe(
    Effect.map((arr) => [...arr]),
    Effect.mapError((cause) =>
      storedConfigCorrupt(
        "Stored string list is corrupt and could not be decoded",
        cause,
      )
    ),
  );
}

export function effectDecodeReleaseProfileRules(
  value: string,
): Effect.Effect<ReleaseProfileRule[], StoredConfigCorruptError> {
  return Schema.decodeUnknown(ReleaseProfileRulesJsonSchema)(value).pipe(
    Effect.map((arr) => [...arr]),
    Effect.mapError((cause) =>
      storedConfigCorrupt(
        "Stored release profile rules are corrupt and could not be decoded",
        cause,
      )
    ),
  );
}

export function effectDecodeQualityProfileRow(
  row: typeof qualityProfiles.$inferSelect,
): Effect.Effect<QualityProfile, StoredConfigCorruptError> {
  return effectDecodeStringList(row.allowedQualities).pipe(
    Effect.map((allowed_qualities) => ({
      allowed_qualities,
      cutoff: row.cutoff,
      max_size: row.maxSize ?? null,
      min_size: row.minSize ?? null,
      name: row.name,
      seadex_preferred: row.seadexPreferred,
      upgrade_allowed: row.upgradeAllowed,
    })),
  );
}

export function effectDecodeReleaseProfileRow(
  row: typeof releaseProfiles.$inferSelect,
): Effect.Effect<ReleaseProfile, StoredConfigCorruptError> {
  return effectDecodeReleaseProfileRules(row.rules).pipe(
    Effect.map((rules) => ({
      enabled: row.enabled,
      id: row.id,
      is_global: row.isGlobal,
      name: row.name,
      rules,
    })),
  );
}

export function effectDecodeConfigCore(
  value: string,
): Effect.Effect<ConfigCore, StoredConfigCorruptError> {
  return Effect.try({
    try: () => parseConfigJson(value),
    catch: (cause) =>
      storedConfigCorrupt(
        "Stored configuration is corrupt and could not be decoded",
        cause,
      ),
  }).pipe(
    Effect.flatMap((parsed) => Schema.decodeUnknown(ConfigCoreSchema)(parsed)),
    Effect.map(cloneConfigCore),
    Effect.mapError((cause) =>
      storedConfigCorrupt(
        "Stored configuration is corrupt and could not be decoded",
        cause,
      )
    ),
  );
}

export function effectDecodeStoredConfigRow(
  row: { data: string } | undefined,
): Effect.Effect<
  ConfigCore,
  StoredConfigCorruptError | StoredConfigMissingError
> {
  if (!row) {
    return Effect.fail(
      new StoredConfigMissingError({
        message: "Stored configuration is missing",
      }),
    );
  }

  return effectDecodeConfigCore(row.data);
}

export function effectDecodeStoredLibraryConfig(
  row: { data: string } | undefined,
): Effect.Effect<ConfigCore["library"], StoredConfigCorruptError> {
  return Effect.try({
    try: () => decodeStoredLibraryConfigOrThrow(row),
    catch: (cause) =>
      cause instanceof StoredConfigCorruptError ? cause : storedConfigCorrupt(
        "Stored library config is corrupt and could not be decoded",
        cause,
      ),
  });
}

export function effectDecodeImagePath(
  row: { data: string } | undefined,
): Effect.Effect<string, StoredConfigCorruptError> {
  return Effect.try({
    try: () => decodeStoredImagePathOrThrow(row),
    catch: (cause) =>
      cause instanceof StoredConfigCorruptError ? cause : storedConfigCorrupt(
        "Stored configuration is corrupt and could not be decoded",
        cause,
      ),
  });
}
