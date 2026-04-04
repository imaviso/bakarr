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
  ReleaseProfileRulesSchema,
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

export const encodeQualityProfileRow = Effect.fn("ConfigCodec.encodeQualityProfileRow")(
  (
    profile: QualityProfile,
  ): Effect.Effect<Schema.Schema.Type<typeof QualityProfileRowSchema>, StoredConfigCorruptError> =>
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
      Effect.flatMap((row) => Schema.decodeUnknown(QualityProfileRowSchema)(row)),
      Effect.mapError((cause) =>
        storedConfigCorrupt("Quality profile is invalid and could not be encoded", cause),
      ),
    ),
);

export const encodeReleaseProfileRow = Effect.fn("ConfigCodec.encodeReleaseProfileRow")(
  (
    profile: CreateReleaseProfileInput | UpdateReleaseProfileInput,
  ): Effect.Effect<
    Schema.Schema.Type<typeof ReleaseProfilePersistedRowSchema>,
    StoredConfigCorruptError
  > =>
    encodeReleaseProfileRowInput(profile).pipe(
      Effect.flatMap((input) => Schema.decodeUnknown(ReleaseProfilePersistedRowSchema)(input)),
      Effect.mapError((cause) =>
        storedConfigCorrupt("Release profile input is invalid and could not be encoded", cause),
      ),
    ),
);

export const encodeReleaseProfileRules = Effect.fn("ConfigCodec.encodeReleaseProfileRules")(
  (rules: readonly ReleaseProfileRule[]): Effect.Effect<string, StoredConfigCorruptError> =>
    Schema.encode(ReleaseProfileRulesJsonSchema)([...rules]).pipe(
      Effect.mapError((cause) =>
        storedConfigCorrupt("Release profile rules are invalid and could not be encoded", cause),
      ),
    ),
);

export const encodeConfigCore = Effect.fn("ConfigCodec.encodeConfigCore")(
  (core: ConfigCore): Effect.Effect<string, StoredConfigCorruptError> =>
    Schema.encode(ConfigCoreJsonSchema)(core).pipe(
      Effect.mapError((cause) =>
        storedConfigCorrupt("Config core is invalid and could not be encoded", cause),
      ),
    ),
);

export const encodeStringList = Effect.fn("ConfigCodec.encodeStringList")(
  (values: readonly string[]): Effect.Effect<string, StoredConfigCorruptError> =>
    Schema.encode(StringListJsonSchema)([...values]).pipe(
      Effect.mapError((cause) =>
        storedConfigCorrupt("String list is invalid and could not be encoded", cause),
      ),
    ),
);

export const encodeNumberList = Effect.fn("ConfigCodec.encodeNumberList")(
  (values: readonly number[]): Effect.Effect<string, StoredConfigCorruptError> =>
    Schema.encode(NumberListJsonSchema)([...values]).pipe(
      Effect.mapError((cause) =>
        storedConfigCorrupt("Number list is invalid and could not be encoded", cause),
      ),
    ),
);

export const decodeNumberList = Effect.fn("ConfigCodec.decodeNumberList")(
  (value: string): Effect.Effect<number[], StoredConfigCorruptError> =>
    Schema.decodeUnknown(NumberListJsonSchema)(value).pipe(
      Effect.map((arr) => [...arr]),
      Effect.mapError((cause) =>
        storedConfigCorrupt("Stored number list is corrupt and could not be decoded", cause),
      ),
    ),
);

export const encodeOptionalNumberList = Effect.fn("ConfigCodec.encodeOptionalNumberList")((
  values: readonly number[],
): Effect.Effect<string | null, StoredConfigCorruptError> => {
  if (values.length === 0) {
    return Effect.succeed(null);
  }

  return encodeNumberList(values);
});

export const decodeOptionalNumberList = Effect.fn("ConfigCodec.decodeOptionalNumberList")((
  value: string | null | undefined,
): Effect.Effect<number[], StoredConfigCorruptError> => {
  if (value == null) {
    return Effect.succeed([]);
  }

  return Schema.decodeUnknown(NumberListJsonSchema)(value).pipe(
    Effect.map((arr) => [...arr]),
    Effect.mapError((cause) =>
      storedConfigCorrupt("Stored optional number list is corrupt and could not be decoded", cause),
    ),
  );
});

export const decodeStringList = Effect.fn("ConfigCodec.decodeStringList")(
  (value: string): Effect.Effect<string[], StoredConfigCorruptError> =>
    Schema.decodeUnknown(StringListJsonSchema)(value).pipe(
      Effect.map((arr) => [...arr]),
      Effect.mapError((cause) =>
        storedConfigCorrupt("Stored string list is corrupt and could not be decoded", cause),
      ),
    ),
);

export const decodeReleaseProfileRules = Effect.fn("ConfigCodec.decodeReleaseProfileRules")(
  (value: string): Effect.Effect<ReleaseProfileRule[], StoredConfigCorruptError> =>
    Schema.decodeUnknown(ReleaseProfileRulesJsonSchema)(value).pipe(
      Effect.map((arr) => [...arr]),
      Effect.mapError((cause) =>
        storedConfigCorrupt(
          "Stored release profile rules are corrupt and could not be decoded",
          cause,
        ),
      ),
    ),
);

export const decodeQualityProfileRow = Effect.fn("ConfigCodec.decodeQualityProfileRow")(
  (
    row: typeof qualityProfiles.$inferSelect,
  ): Effect.Effect<QualityProfile, StoredConfigCorruptError> =>
    Schema.decodeUnknown(QualityProfileRowSchema)(row).pipe(
      Effect.flatMap((decodedRow) =>
        Schema.decodeUnknown(StringListJsonSchema)(decodedRow.allowedQualities).pipe(
          Effect.map((allowed_qualities) => ({
            allowed_qualities,
            cutoff: decodedRow.cutoff,
            max_size: decodedRow.maxSize,
            min_size: decodedRow.minSize,
            name: decodedRow.name,
            seadex_preferred: decodedRow.seadexPreferred,
            upgrade_allowed: decodedRow.upgradeAllowed,
          })),
        ),
      ),
      Effect.mapError((cause) =>
        storedConfigCorrupt(
          "Stored quality profile row is corrupt and could not be decoded",
          cause,
        ),
      ),
    ),
);

export const decodeReleaseProfileRow = Effect.fn("ConfigCodec.decodeReleaseProfileRow")(
  (
    row: typeof releaseProfiles.$inferSelect,
  ): Effect.Effect<ReleaseProfile, StoredConfigCorruptError> =>
    Schema.decodeUnknown(ReleaseProfileRowSchema)(row).pipe(
      Effect.flatMap((decodedRow) =>
        Schema.decodeUnknown(ReleaseProfileRulesJsonSchema)(decodedRow.rules).pipe(
          Effect.map((rules) => ({
            enabled: decodedRow.enabled,
            id: decodedRow.id,
            is_global: decodedRow.isGlobal,
            name: decodedRow.name,
            rules: [...rules],
          })),
        ),
      ),
      Effect.mapError((cause) =>
        storedConfigCorrupt(
          "Stored release profile row is corrupt and could not be decoded",
          cause,
        ),
      ),
    ),
);

export const toConfigCore = Effect.fn("ConfigCodec.toConfigCore")(
  (config: Config): Effect.Effect<ConfigCore, StoredConfigCorruptError> =>
    Schema.decodeUnknown(ConfigCoreSchema)(config).pipe(
      Effect.mapError((cause) =>
        storedConfigCorrupt("Runtime configuration could not be projected to core schema", cause),
      ),
    ),
);

export const composeConfig = Effect.fn("ConfigCodec.composeConfig")(
  (
    core: ConfigCore,
    profiles: readonly QualityProfile[],
  ): Effect.Effect<Config, StoredConfigCorruptError> =>
    Schema.encode(ConfigCoreSchema)(core).pipe(
      Effect.flatMap((encodedCore) =>
        Schema.decodeUnknown(ConfigSchema)({
          ...encodedCore,
          profiles: [...profiles],
        } satisfies Schema.Schema.Encoded<typeof ConfigSchema>),
      ),
      Effect.mapError((cause) =>
        storedConfigCorrupt("Stored configuration is corrupt and could not be composed", cause),
      ),
    ),
);

export const decodeConfigCore = Effect.fn("ConfigCodec.decodeConfigCore")(
  (value: string): Effect.Effect<ConfigCore, StoredConfigCorruptError> =>
    Schema.decodeUnknown(ConfigCoreJsonSchema)(value).pipe(
      Effect.mapError((cause) =>
        storedConfigCorrupt("Stored configuration is corrupt and could not be decoded", cause),
      ),
    ),
);

export const decodeStoredConfigRow = Effect.fn("ConfigCodec.decodeStoredConfigRow")((
  row: { data: string } | undefined,
): Effect.Effect<ConfigCore, StoredConfigCorruptError | StoredConfigMissingError> => {
  if (!row) {
    return Effect.fail(
      new StoredConfigMissingError({
        message: "Stored configuration is missing",
      }),
    );
  }

  return decodeConfigCore(row.data);
});

export const decodeStoredLibraryConfig = Effect.fn("ConfigCodec.decodeStoredLibraryConfig")((
  row: { data: string } | undefined,
): Effect.Effect<ConfigCore["library"], StoredConfigCorruptError> => {
  if (!row) {
    return Effect.fail(
      new StoredConfigCorruptError({
        cause: new Error("Missing stored configuration row"),
        message: "Stored configuration is missing library settings",
      }),
    );
  }

  return decodeConfigCore(row.data).pipe(Effect.map((config) => ({ ...config.library })));
});

export const decodeImagePath = Effect.fn("ConfigCodec.decodeImagePath")((
  row: { data: string } | undefined,
): Effect.Effect<string, StoredConfigCorruptError> => {
  if (!row) {
    return Effect.fail(
      new StoredConfigCorruptError({
        cause: new Error("Missing stored configuration row"),
        message: "Stored configuration is missing image path settings",
      }),
    );
  }

  return decodeConfigCore(row.data).pipe(Effect.map((config) => config.general.images_path.trim()));
});

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
