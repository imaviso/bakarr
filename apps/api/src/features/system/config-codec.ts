import { Effect, ParseResult, Schema } from "effect";

import type {
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
} from "../../../../../packages/shared/src/index.ts";
import { qualityProfiles, releaseProfiles } from "../../db/schema.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "./errors.ts";
import {
  ConfigCoreSchema,
  NumberListSchema,
  QualityProfileSchema,
  ReleaseProfileRulesSchema,
  ReleaseProfileSchema,
  StringListSchema,
} from "./config-schema.ts";
import { makeDefaultConfig } from "./defaults.ts";

export type ConfigCore = Schema.Schema.Type<typeof ConfigCoreSchema>;

const StringListJsonSchema = Schema.parseJson(StringListSchema);
const NumberListJsonSchema = Schema.parseJson(NumberListSchema);
const ReleaseProfileRulesJsonSchema = Schema.parseJson(ReleaseProfileRulesSchema);
const ConfigCoreJsonSchema = Schema.parseJson(ConfigCoreSchema);

function storedConfigCorrupt(message: string, cause?: unknown) {
  const detail =
    cause && ParseResult.isParseError(cause)
      ? ParseResult.TreeFormatter.formatErrorSync(cause)
      : undefined;

  return new StoredConfigCorruptError({
    message: detail ? `${message}: ${detail}` : message,
  });
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

export function decodeQualityProfileRow(row: typeof qualityProfiles.$inferSelect): QualityProfile {
  return Schema.decodeUnknownSync(QualityProfileSchema)({
    allowed_qualities: decodeStringList(row.allowedQualities),
    cutoff: row.cutoff,
    max_size: row.maxSize ?? null,
    min_size: row.minSize ?? null,
    name: row.name,
    seadex_preferred: row.seadexPreferred,
    upgrade_allowed: row.upgradeAllowed,
  });
}

export function decodeReleaseProfileRow(row: typeof releaseProfiles.$inferSelect): ReleaseProfile {
  return Schema.decodeUnknownSync(ReleaseProfileSchema)({
    enabled: row.enabled,
    id: row.id,
    is_global: row.isGlobal,
    name: row.name,
    rules: decodeReleaseProfileRules(row.rules),
  });
}

export function encodeReleaseProfileRules(rules: readonly ReleaseProfileRule[]) {
  return Schema.encodeSync(ReleaseProfileRulesJsonSchema)(
    rules.map((rule) => ({
      ...rule,
    })),
  );
}

export function decodeReleaseProfileRules(value: string): ReleaseProfileRule[] {
  return [...Schema.decodeUnknownSync(ReleaseProfileRulesJsonSchema)(value)];
}

export function encodeConfigCore(core: ConfigCore): string {
  return Schema.encodeSync(ConfigCoreJsonSchema)(core);
}

export function decodeConfigCore(value: string): ConfigCore {
  return Schema.decodeUnknownSync(ConfigCoreJsonSchema)(value);
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

export function effectDecodeNumberList(
  value: string,
): Effect.Effect<number[], StoredConfigCorruptError> {
  return Schema.decodeUnknown(NumberListJsonSchema)(value).pipe(
    Effect.map((arr) => [...arr]),
    Effect.mapError((cause) =>
      storedConfigCorrupt("Stored number list is corrupt and could not be decoded", cause),
    ),
  );
}

export function encodeOptionalNumberList(values: readonly number[]): string | null {
  const normalized = [...new Set(values.filter((item) => Number.isInteger(item) && item > 0))].sort(
    (left, right) => left - right,
  );

  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

export function decodeOptionalNumberList(value: string | null | undefined): number[] {
  if (value == null) {
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
      storedConfigCorrupt("Stored string list is corrupt and could not be decoded", cause),
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
      ),
    ),
  );
}

export function effectDecodeQualityProfileRow(
  row: typeof qualityProfiles.$inferSelect,
): Effect.Effect<QualityProfile, StoredConfigCorruptError> {
  return effectDecodeStringList(row.allowedQualities).pipe(
    Effect.flatMap((allowed_qualities) =>
      Schema.decodeUnknown(QualityProfileSchema)({
        allowed_qualities,
        cutoff: row.cutoff,
        max_size: row.maxSize ?? null,
        min_size: row.minSize ?? null,
        name: row.name,
        seadex_preferred: row.seadexPreferred,
        upgrade_allowed: row.upgradeAllowed,
      }).pipe(
        Effect.mapError((cause) =>
          storedConfigCorrupt(
            "Stored quality profile row is corrupt and could not be decoded",
            cause,
          ),
        ),
      ),
    ),
  );
}

export function effectDecodeReleaseProfileRow(
  row: typeof releaseProfiles.$inferSelect,
): Effect.Effect<ReleaseProfile, StoredConfigCorruptError> {
  return effectDecodeReleaseProfileRules(row.rules).pipe(
    Effect.flatMap((rules) =>
      Schema.decodeUnknown(ReleaseProfileSchema)({
        enabled: row.enabled,
        id: row.id,
        is_global: row.isGlobal,
        name: row.name,
        rules,
      }).pipe(
        Effect.mapError((cause) =>
          storedConfigCorrupt(
            "Stored release profile row is corrupt and could not be decoded",
            cause,
          ),
        ),
      ),
    ),
  );
}

export function effectDecodeConfigCore(
  value: string,
): Effect.Effect<ConfigCore, StoredConfigCorruptError> {
  return Schema.decodeUnknown(ConfigCoreJsonSchema)(value).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("Stored configuration is corrupt and could not be decoded", cause),
    ),
  );
}

export function effectDecodeStoredConfigRow(
  row: { data: string } | undefined,
): Effect.Effect<ConfigCore, StoredConfigCorruptError | StoredConfigMissingError> {
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
  if (!row) {
    return Effect.succeed({ ...makeDefaultConfig(":memory:").library });
  }

  return effectDecodeConfigCore(row.data).pipe(Effect.map((config) => ({ ...config.library })));
}

export function effectDecodeImagePath(
  row: { data: string } | undefined,
): Effect.Effect<string, StoredConfigCorruptError> {
  if (!row) {
    return Effect.succeed("./data/images");
  }

  return effectDecodeConfigCore(row.data).pipe(
    Effect.map((config) => config.general.images_path.trim() || "./data/images"),
  );
}
