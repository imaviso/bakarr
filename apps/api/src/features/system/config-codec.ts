import { Effect, ParseResult, Schema } from "effect";

import type { Config, QualityProfile } from "@packages/shared/index.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";
import { ConfigCoreSchema, ConfigSchema } from "@/features/system/config-schema.ts";
import { normalizeMetadataProvidersConfig } from "@/features/system/metadata-providers-config.ts";
import { normalizeQBitTorrentConfig } from "@/features/system/qbittorrent-config.ts";

export type ConfigCore = Schema.Schema.Type<typeof ConfigCoreSchema>;
export type ConfigCoreEncoded = Schema.Schema.Encoded<typeof ConfigCoreSchema>;
const ConfigCoreJsonSchema = Schema.parseJson(ConfigCoreSchema);

export const normalizeConfig = Effect.fn("SystemConfig.normalizeConfig")(function* (
  config: Config,
) {
  const qbittorrent = yield* normalizeQBitTorrentConfig(config.qbittorrent);
  const metadata = yield* normalizeMetadataProvidersConfig(config.metadata);

  return {
    ...config,
    metadata,
    qbittorrent,
  } satisfies Config;
});

function storedConfigCorrupt(message: string, cause: unknown) {
  const detail =
    cause && ParseResult.isParseError(cause)
      ? ParseResult.TreeFormatter.formatErrorSync(cause)
      : undefined;

  return new StoredConfigCorruptError({
    cause,
    message: detail ? `${message}: ${detail}` : message,
  });
}

export const encodeConfigCore = Effect.fn("ConfigCodec.encodeConfigCore")(
  (core: ConfigCore): Effect.Effect<string, StoredConfigCorruptError> =>
    Schema.encode(ConfigCoreJsonSchema)(core).pipe(
      Effect.mapError((cause) =>
        storedConfigCorrupt("Config core is invalid and could not be encoded", cause),
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
