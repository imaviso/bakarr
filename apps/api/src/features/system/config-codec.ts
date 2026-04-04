import { Effect, ParseResult, Schema } from "effect";

import type {
  Config,
  QualityProfile,
  ReleaseProfile,
  ReleaseProfileRule,
} from "@packages/shared/index.ts";
import { qualityProfiles, releaseProfiles } from "@/db/schema.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";
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
} from "@/features/system/config-schema.ts";

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
      Schema.encode(StringListJsonSchema)([...profile.allowed_qualities]).pipe(
        Effect.map((allowedQualities) => ({
          allowedQualities,
          cutoff: profile.cutoff,
          maxSize: profile.max_size ?? null,
          minSize: profile.min_size ?? null,
          name: profile.name,
          seadexPreferred: profile.seadex_preferred,
          upgradeAllowed: profile.upgrade_allowed,
        })),
        Effect.mapError(
          () =>
            new ParseResult.Type(
              QualityProfileRowSchema.ast,
              profile,
              "Quality profile is invalid and could not be encoded",
            ),
        ),
      ) as Effect.Effect<
        Schema.Schema.Type<typeof QualityProfileRowSchema>,
        ParseResult.ParseIssue,
        never
      >,
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
      Schema.encode(ReleaseProfileRulesJsonSchema)([...profile.rules]).pipe(
        Effect.map((rules) => ({
          enabled: profile.enabled,
          id: profile.id,
          isGlobal: profile.is_global,
          name: profile.name,
          rules,
        })),
        Effect.mapError(
          () =>
            new ParseResult.Type(
              ReleaseProfileRowSchema.ast,
              profile,
              "Release profile is invalid and could not be encoded",
            ),
        ),
      ) as Effect.Effect<
        Schema.Schema.Type<typeof ReleaseProfileRowSchema>,
        ParseResult.ParseIssue,
        never
      >,
    strict: true,
  },
);

function storedConfigCorrupt(message: string, cause?: unknown) {
  const detail =
    cause && ParseResult.isParseError(cause)
      ? ParseResult.TreeFormatter.formatErrorSync(cause)
      : undefined;

  return new StoredConfigCorruptError({
    cause,
    message: detail ? `${message}: ${detail}` : message,
  });
}

export function encodeQualityProfileRow(
  profile: QualityProfile,
): Effect.Effect<Schema.Schema.Type<typeof QualityProfileRowSchema>, StoredConfigCorruptError> {
  return Schema.encode(QualityProfileRowToProfileSchema)(profile).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("Quality profile is invalid and could not be encoded", cause),
    ),
  );
}

export function encodeReleaseProfileRow(
  profile: CreateReleaseProfileInput | UpdateReleaseProfileInput,
): Effect.Effect<
  Schema.Schema.Type<typeof ReleaseProfilePersistedRowSchema>,
  StoredConfigCorruptError
> {
  return encodeReleaseProfileRowInput(profile).pipe(
    Effect.flatMap((input) => Schema.decodeUnknown(ReleaseProfilePersistedRowSchema)(input)),
    Effect.mapError((cause) =>
      storedConfigCorrupt("Release profile input is invalid and could not be encoded", cause),
    ),
  );
}

export function effectEncodeReleaseProfileRow(
  profile: CreateReleaseProfileInput | UpdateReleaseProfileInput,
): Effect.Effect<
  Schema.Schema.Type<typeof ReleaseProfilePersistedRowSchema>,
  StoredConfigCorruptError
> {
  return encodeReleaseProfileRow(profile);
}

export function encodeReleaseProfileRules(
  rules: readonly ReleaseProfileRule[],
): Effect.Effect<string, StoredConfigCorruptError> {
  return Schema.encode(ReleaseProfileRulesJsonSchema)([...rules]).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("Release profile rules are invalid and could not be encoded", cause),
    ),
  );
}

export function encodeConfigCore(
  core: ConfigCore,
): Effect.Effect<string, StoredConfigCorruptError> {
  return Schema.encode(ConfigCoreJsonSchema)(core).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("Config core is invalid and could not be encoded", cause),
    ),
  );
}

export function encodeStringList(
  values: readonly string[],
): Effect.Effect<string, StoredConfigCorruptError> {
  return Schema.encode(StringListJsonSchema)([...values]).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("String list is invalid and could not be encoded", cause),
    ),
  );
}

export function encodeNumberList(
  values: readonly number[],
): Effect.Effect<string, StoredConfigCorruptError> {
  return Schema.encode(NumberListJsonSchema)([...values]).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("Number list is invalid and could not be encoded", cause),
    ),
  );
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

export function encodeOptionalNumberList(
  values: readonly number[],
): Effect.Effect<string | null, StoredConfigCorruptError> {
  if (values.length === 0) {
    return Effect.succeed(null);
  }

  return encodeNumberList(values);
}

export function effectDecodeOptionalNumberList(
  value: string | null | undefined,
): Effect.Effect<number[], StoredConfigCorruptError> {
  if (value == null) {
    return Effect.succeed([]);
  }

  return Schema.decodeUnknown(NumberListJsonSchema)(value).pipe(
    Effect.map((arr) => [...arr]),
    Effect.mapError((cause) =>
      storedConfigCorrupt("Stored optional number list is corrupt and could not be decoded", cause),
    ),
  );
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

export function toConfigCore(config: Config): Effect.Effect<ConfigCore, StoredConfigCorruptError> {
  return Schema.decodeUnknown(ConfigCoreSchema)(config).pipe(
    Effect.mapError((cause) =>
      storedConfigCorrupt("Runtime configuration could not be projected to core schema", cause),
    ),
  );
}

export function effectToConfigCore(
  config: Config,
): Effect.Effect<ConfigCore, StoredConfigCorruptError> {
  return toConfigCore(config);
}

export function composeConfig(
  core: ConfigCore,
  profiles: readonly QualityProfile[],
): Effect.Effect<Config, StoredConfigCorruptError> {
  return Schema.encode(ConfigCoreSchema)(core).pipe(
    Effect.flatMap((encodedCore) =>
      Schema.decodeUnknown(ConfigSchema)({
        ...encodedCore,
        profiles: [...profiles],
      } satisfies Schema.Schema.Encoded<typeof ConfigSchema>),
    ),
    Effect.mapError((cause) =>
      storedConfigCorrupt("Stored configuration is corrupt and could not be composed", cause),
    ),
  );
}

export function effectComposeConfig(
  core: ConfigCore,
  profiles: readonly QualityProfile[],
): Effect.Effect<Config, StoredConfigCorruptError> {
  return composeConfig(core, profiles);
}

export function effectEncodeConfigCore(
  core: ConfigCore,
): Effect.Effect<string, StoredConfigCorruptError> {
  return encodeConfigCore(core);
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
        cause: new Error("Missing stored configuration row"),
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
        cause: new Error("Missing stored configuration row"),
        message: "Stored configuration is missing image path settings",
      }),
    );
  }

  return effectDecodeConfigCore(row.data).pipe(
    Effect.map((config) => config.general.images_path.trim()),
  );
}

function encodeReleaseProfileRowInput(
  profile: CreateReleaseProfileInput | UpdateReleaseProfileInput,
): Effect.Effect<
  Schema.Schema.Encoded<typeof ReleaseProfilePersistedRowSchema>,
  StoredConfigCorruptError
> {
  return encodeReleaseProfileRules(profile.rules).pipe(
    Effect.map(
      (rules) =>
        ({
          enabled: profile.enabled ?? true,
          isGlobal: profile.is_global,
          name: profile.name,
          rules,
        }) satisfies Schema.Schema.Encoded<typeof ReleaseProfilePersistedRowSchema>,
    ),
  );
}
