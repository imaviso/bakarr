import { Effect, ParseResult, Schema } from "effect";

import type {
  Config,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
} from "../../../../../packages/shared/src/index.ts";
import { qualityProfiles, releaseProfiles } from "../../db/schema.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "./errors.ts";
import {
  ConfigCoreSchema,
  ConfigSchema,
  type CreateReleaseProfileInput,
  NumberListSchema,
  QualityProfileSchema,
  ReleaseProfileRulesSchema,
  ReleaseProfileSchema,
  StringListSchema,
  type UpdateReleaseProfileInput,
} from "./config-schema.ts";

export type ConfigCore = Schema.Schema.Type<typeof ConfigCoreSchema>;
export type ConfigCoreEncoded = Schema.Schema.Encoded<typeof ConfigCoreSchema>;

const StringListJsonSchema = Schema.parseJson(StringListSchema);
const NumberListJsonSchema = Schema.parseJson(NumberListSchema);
const ReleaseProfileRulesJsonSchema = Schema.parseJson(ReleaseProfileRulesSchema);
const ConfigCoreJsonSchema = Schema.parseJson(ConfigCoreSchema);

const QualityProfileRowSchema = Schema.Struct({
  allowedQualities: Schema.String,
  cutoff: Schema.String,
  maxSize: Schema.NullOr(Schema.String),
  minSize: Schema.NullOr(Schema.String),
  name: Schema.String,
  seadexPreferred: Schema.Boolean,
  upgradeAllowed: Schema.Boolean,
});

const ReleaseProfilePersistedRowSchema = Schema.Struct({
  enabled: Schema.Boolean,
  isGlobal: Schema.Boolean,
  name: Schema.String,
  rules: Schema.String,
});

const ReleaseProfileRowSchema = Schema.Struct({
  enabled: Schema.Boolean,
  id: Schema.Number,
  isGlobal: Schema.Boolean,
  name: Schema.String,
  rules: Schema.String,
});

const QualityProfileRowToProfileSchema = Schema.transformOrFail(
  QualityProfileRowSchema,
  QualityProfileSchema,
  {
    decode: (row) =>
      Schema.decodeUnknown(StringListJsonSchema)(row.allowedQualities).pipe(
        Effect.map((allowed_qualities) => ({
          allowed_qualities,
          cutoff: row.cutoff,
          max_size: row.maxSize,
          min_size: row.minSize,
          name: row.name,
          seadex_preferred: row.seadexPreferred,
          upgrade_allowed: row.upgradeAllowed,
        })),
        Effect.mapError(
          () =>
            new ParseResult.Type(
              QualityProfileSchema.ast,
              row,
              "Stored quality profile row is corrupt",
            ),
        ),
      ) as Effect.Effect<QualityProfile, ParseResult.ParseIssue, never>,
    encode: (profile) =>
      Effect.succeed({
        allowedQualities: encodeStringList(profile.allowed_qualities),
        cutoff: profile.cutoff,
        maxSize: profile.max_size ?? null,
        minSize: profile.min_size ?? null,
        name: profile.name,
        seadexPreferred: profile.seadex_preferred,
        upgradeAllowed: profile.upgrade_allowed,
      }),
    strict: true,
  },
);

const ReleaseProfileRowToProfileSchema = Schema.transformOrFail(
  ReleaseProfileRowSchema,
  ReleaseProfileSchema,
  {
    decode: (row) =>
      Schema.decodeUnknown(ReleaseProfileRulesJsonSchema)(row.rules).pipe(
        Effect.map((rules) => ({
          enabled: row.enabled,
          id: row.id,
          is_global: row.isGlobal,
          name: row.name,
          rules,
        })),
        Effect.mapError(
          () =>
            new ParseResult.Type(
              ReleaseProfileSchema.ast,
              row,
              "Stored release profile row is corrupt",
            ),
        ),
      ) as Effect.Effect<ReleaseProfile, ParseResult.ParseIssue, never>,
    encode: (profile) =>
      Effect.succeed({
        enabled: profile.enabled,
        id: profile.id,
        isGlobal: profile.is_global,
        name: profile.name,
        rules: encodeReleaseProfileRules(profile.rules),
      }),
    strict: true,
  },
);

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
  return Schema.encodeSync(QualityProfileRowToProfileSchema)(profile);
}

export function decodeQualityProfileRow(row: typeof qualityProfiles.$inferSelect): QualityProfile {
  return Schema.decodeUnknownSync(QualityProfileRowToProfileSchema)(row);
}

export function decodeReleaseProfileRow(row: typeof releaseProfiles.$inferSelect): ReleaseProfile {
  return Schema.decodeUnknownSync(ReleaseProfileRowToProfileSchema)(row);
}

export function encodeReleaseProfileRow(
  profile: CreateReleaseProfileInput | UpdateReleaseProfileInput,
) {
  return Schema.decodeUnknownSync(ReleaseProfilePersistedRowSchema)({
    enabled: profile.enabled ?? true,
    isGlobal: profile.is_global,
    name: profile.name,
    rules: encodeReleaseProfileRules(profile.rules),
  });
}

export function encodeReleaseProfileRules(rules: readonly ReleaseProfileRule[]) {
  return Schema.encodeSync(ReleaseProfileRulesJsonSchema)([...rules]);
}

export function decodeReleaseProfileRules(value: string): ReleaseProfileRule[] {
  return [...Schema.decodeUnknownSync(ReleaseProfileRulesJsonSchema)(value)];
}

export function encodeConfigCore(core: ConfigCore | ConfigCoreEncoded): string {
  return Schema.encodeSync(ConfigCoreJsonSchema)(core as ConfigCore);
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
  if (values.length === 0) {
    return null;
  }

  return Schema.encodeSync(NumberListJsonSchema)([...values]);
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
  return Schema.decodeUnknown(QualityProfileRowToProfileSchema)(row).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("Stored quality profile row is corrupt and could not be decoded", cause),
    ),
  );
}

export function effectDecodeReleaseProfileRow(
  row: typeof releaseProfiles.$inferSelect,
): Effect.Effect<ReleaseProfile, StoredConfigCorruptError> {
  return Schema.decodeUnknown(ReleaseProfileRowToProfileSchema)(row).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("Stored release profile row is corrupt and could not be decoded", cause),
    ),
  );
}

export function toConfigCore(config: Config): ConfigCore {
  return Schema.decodeUnknownSync(ConfigCoreSchema)(config);
}

export function withLibraryDefaults(
  core: ConfigCore,
  libraryDefaults: ConfigCore["library"],
): ConfigCore {
  const encodedCore = Schema.encodeSync(ConfigCoreSchema)(core);

  return Schema.decodeUnknownSync(ConfigCoreSchema)({
    ...encodedCore,
    library: {
      ...libraryDefaults,
      ...encodedCore.library,
    },
  });
}

export function composeConfig(core: ConfigCore, profiles: readonly QualityProfile[]): Config {
  const encodedCore = Schema.encodeSync(ConfigCoreSchema)(core);

  return Schema.decodeUnknownSync(ConfigSchema)({
    ...encodedCore,
    profiles: [...profiles],
  });
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
    return Effect.fail(
      new StoredConfigCorruptError({
        message: "Stored configuration is missing library settings",
      }),
    );
  }

  return effectDecodeConfigCore(row.data).pipe(Effect.map((config) => ({ ...config.library })));
}

export function effectDecodeImagePath(
  row: { data: string } | undefined,
): Effect.Effect<string, StoredConfigCorruptError> {
  if (!row) {
    return Effect.fail(
      new StoredConfigCorruptError({
        message: "Stored configuration is missing image path settings",
      }),
    );
  }

  return effectDecodeConfigCore(row.data).pipe(
    Effect.map((config) => config.general.images_path.trim()),
  );
}
