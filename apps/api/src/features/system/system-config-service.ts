import { Context, Effect, Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import {
  composeConfig,
  decodeStoredConfigRow,
  normalizeConfig,
} from "@/features/system/config-codec.ts";
import { decodeQualityProfileRow } from "@/features/profiles/profile-codec.ts";
import { StoredConfigCorruptError, StoredConfigMissingError } from "@/features/system/errors.ts";
import {
  QualityProfileRepository,
  QualityProfileRepositoryLive,
} from "@/features/system/repository/quality-profile-repository.ts";
import {
  SystemConfigRepository,
  SystemConfigRepositoryLive,
} from "@/features/system/repository/system-config-repository.ts";

export interface SystemConfigServiceShape {
  readonly getConfig: () => Effect.Effect<
    Config,
    DatabaseError | StoredConfigCorruptError | StoredConfigMissingError
  >;
}

export class SystemConfigService extends Context.Tag("@bakarr/api/SystemConfigService")<
  SystemConfigService,
  SystemConfigServiceShape
>() {}

const makeSystemConfigService = Effect.gen(function* () {
  const systemConfigRepository = yield* SystemConfigRepository;
  const qualityProfileRepository = yield* QualityProfileRepository;

  const getConfig = Effect.fn("SystemConfigService.getConfig")(function* () {
    const storedConfig = yield* systemConfigRepository.loadSystemConfigRow();
    const profiles = yield* qualityProfileRepository.listQualityProfileRows();

    const core = yield* decodeStoredConfigRow(storedConfig).pipe(
      Effect.catchTag("StoredConfigCorruptError", (error) =>
        Effect.fail(
          new StoredConfigCorruptError({
            cause: error.cause,
            message: `${error.message}. Re-save config to repair.`,
          }),
        ),
      ),
    );
    const decodedProfiles = yield* Effect.forEach(profiles, decodeQualityProfileRow);

    const composedConfig = yield* composeConfig(core, decodedProfiles);

    return yield* normalizeConfig(composedConfig).pipe(
      Effect.catchTag("ConfigValidationError", (error) =>
        Effect.fail(
          new StoredConfigCorruptError({
            cause: error.cause,
            message: `Stored configuration is corrupt and could not be normalized: ${error.message}`,
          }),
        ),
      ),
    );
  });

  return { getConfig } satisfies SystemConfigServiceShape;
});

export const SystemConfigServiceLive = Layer.effect(
  SystemConfigService,
  makeSystemConfigService,
).pipe(Layer.provide(Layer.mergeAll(SystemConfigRepositoryLive, QualityProfileRepositoryLive)));

export function redactConfigSecrets(config: Config): Config {
  return {
    ...config,
    ...(config.metadata
      ? {
          metadata: {
            ...config.metadata,
            anidb: {
              ...config.metadata.anidb,
              password: null,
            },
          },
        }
      : {}),
    qbittorrent: {
      ...config.qbittorrent,
      password: null,
    },
  } satisfies Config;
}
