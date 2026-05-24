import { Effect, Schema } from "effect";

import {
  brandReleaseProfileId,
  type QualityProfile,
  type ReleaseProfile,
  type ReleaseProfileRule,
} from "@packages/shared/index.ts";
import { qualityProfiles, releaseProfiles } from "@/db/schema.ts";
import {
  makeStoredConfigCorruptError,
  StoredConfigCorruptError,
} from "@/features/system/errors.ts";
import { decodeJson, encodeJson } from "@/infra/effect/schema-json.ts";
import {
  NumberListSchema,
  ReleaseProfileRulesSchema,
  StringListSchema,
  type CreateReleaseProfileInput,
  type UpdateReleaseProfileInput,
} from "@/features/system/config-schema.ts";

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

export const encodeStringList = Effect.fn("ProfileCodec.encodeStringList")(
  (values: readonly string[]): Effect.Effect<string, StoredConfigCorruptError> =>
    encodeJson(StringListSchema, [...values], (cause) =>
      makeStoredConfigCorruptError("String list is invalid and could not be encoded", cause),
    ),
);

export const encodeNumberList = Effect.fn("ProfileCodec.encodeNumberList")(
  (values: readonly number[]): Effect.Effect<string, StoredConfigCorruptError> =>
    encodeJson(NumberListSchema, [...values], (cause) =>
      makeStoredConfigCorruptError("Number list is invalid and could not be encoded", cause),
    ),
);

export const decodeNumberList = Effect.fn("ProfileCodec.decodeNumberList")(
  (value: string): Effect.Effect<number[], StoredConfigCorruptError> =>
    decodeJson(NumberListSchema, value, (cause) =>
      makeStoredConfigCorruptError("Stored number list is corrupt and could not be decoded", cause),
    ).pipe(Effect.map((arr) => [...arr])),
);

export const encodeOptionalNumberList = Effect.fn("ProfileCodec.encodeOptionalNumberList")((
  values: readonly number[],
): Effect.Effect<string | null, StoredConfigCorruptError> => {
  if (values.length === 0) {
    return Effect.succeed(null);
  }

  return encodeNumberList(values);
});

export const decodeOptionalNumberList = Effect.fn("ProfileCodec.decodeOptionalNumberList")((
  value: string | null | undefined,
): Effect.Effect<number[], StoredConfigCorruptError> => {
  if (value == null) {
    return Effect.succeed([]);
  }

  return decodeJson(NumberListSchema, value, (cause) =>
    makeStoredConfigCorruptError(
      "Stored optional number list is corrupt and could not be decoded",
      cause,
    ),
  ).pipe(Effect.map((arr) => [...arr]));
});

export const decodeStringList = Effect.fn("ProfileCodec.decodeStringList")(
  (value: string): Effect.Effect<string[], StoredConfigCorruptError> =>
    decodeJson(StringListSchema, value, (cause) =>
      makeStoredConfigCorruptError("Stored string list is corrupt and could not be decoded", cause),
    ).pipe(Effect.map((arr) => [...arr])),
);

export const encodeQualityProfileRow = Effect.fn("ProfileCodec.encodeQualityProfileRow")(
  (
    profile: QualityProfile,
  ): Effect.Effect<Schema.Schema.Type<typeof QualityProfileRowSchema>, StoredConfigCorruptError> =>
    encodeJson(StringListSchema, [...profile.allowed_qualities], (cause) =>
      makeStoredConfigCorruptError("Quality profile is invalid and could not be encoded", cause),
    ).pipe(
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
        makeStoredConfigCorruptError("Quality profile is invalid and could not be encoded", cause),
      ),
    ),
);

export const decodeQualityProfileRow = Effect.fn("ProfileCodec.decodeQualityProfileRow")(
  (
    row: typeof qualityProfiles.$inferSelect,
  ): Effect.Effect<QualityProfile, StoredConfigCorruptError> =>
    Schema.decodeUnknown(QualityProfileRowSchema)(row).pipe(
      Effect.flatMap((decodedRow) =>
        decodeJson(StringListSchema, decodedRow.allowedQualities, (cause) =>
          makeStoredConfigCorruptError(
            "Stored quality profile row is corrupt and could not be decoded",
            cause,
          ),
        ).pipe(
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
        makeStoredConfigCorruptError(
          "Stored quality profile row is corrupt and could not be decoded",
          cause,
        ),
      ),
    ),
);

export const encodeReleaseProfileRules = Effect.fn("ProfileCodec.encodeReleaseProfileRules")(
  (rules: readonly ReleaseProfileRule[]): Effect.Effect<string, StoredConfigCorruptError> =>
    encodeJson(ReleaseProfileRulesSchema, [...rules], (cause) =>
      makeStoredConfigCorruptError(
        "Release profile rules are invalid and could not be encoded",
        cause,
      ),
    ),
);

export const decodeReleaseProfileRules = Effect.fn("ProfileCodec.decodeReleaseProfileRules")(
  (value: string): Effect.Effect<ReleaseProfileRule[], StoredConfigCorruptError> =>
    decodeJson(ReleaseProfileRulesSchema, value, (cause) =>
      makeStoredConfigCorruptError(
        "Stored release profile rules are corrupt and could not be decoded",
        cause,
      ),
    ).pipe(Effect.map((arr) => [...arr])),
);

export const encodeReleaseProfileRow = Effect.fn("ProfileCodec.encodeReleaseProfileRow")(
  (
    profile: CreateReleaseProfileInput | UpdateReleaseProfileInput,
  ): Effect.Effect<
    Schema.Schema.Type<typeof ReleaseProfilePersistedRowSchema>,
    StoredConfigCorruptError
  > =>
    encodeReleaseProfileRowInput(profile).pipe(
      Effect.flatMap((input) => Schema.decodeUnknown(ReleaseProfilePersistedRowSchema)(input)),
      Effect.mapError((cause) =>
        makeStoredConfigCorruptError(
          "Release profile input is invalid and could not be encoded",
          cause,
        ),
      ),
    ),
);

export const decodeReleaseProfileRow = Effect.fn("ProfileCodec.decodeReleaseProfileRow")(
  (
    row: typeof releaseProfiles.$inferSelect,
  ): Effect.Effect<ReleaseProfile, StoredConfigCorruptError> =>
    Schema.decodeUnknown(ReleaseProfileRowSchema)(row).pipe(
      Effect.flatMap((decodedRow) =>
        decodeJson(ReleaseProfileRulesSchema, decodedRow.rules, (cause) =>
          makeStoredConfigCorruptError(
            "Stored release profile row is corrupt and could not be decoded",
            cause,
          ),
        ).pipe(
          Effect.map((rules) => ({
            enabled: decodedRow.enabled,
            id: brandReleaseProfileId(decodedRow.id),
            is_global: decodedRow.isGlobal,
            name: decodedRow.name,
            rules: [...rules],
          })),
        ),
      ),
      Effect.mapError((cause) =>
        makeStoredConfigCorruptError(
          "Stored release profile row is corrupt and could not be decoded",
          cause,
        ),
      ),
    ),
);

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
