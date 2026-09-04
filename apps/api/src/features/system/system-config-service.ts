import type { Config } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import {
  composeConfig,
  decodeStoredConfigRow,
  normalizeConfig,
} from "@/features/system/config-codec.ts";
import { decodeQualityProfileRow } from "@/features/system/profile-codec.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";
import { StoredConfigMissingError } from "@/features/system/errors.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { Context, Effect, Layer } from "effect";

export interface SystemConfigServiceShape {
  readonly getConfig: () => Effect.Effect<
    Config,
    DatabaseError | StoredConfigCorruptError | StoredConfigMissingError
  >;
}

const makeSystemConfigService = Effect.fn("SystemConfigService.make")(function* () {
  const systemConfigRepository = yield* SystemConfigRepository;
  const qualityProfileRepository = yield* QualityProfileRepository;

  const getConfig: SystemConfigServiceShape["getConfig"] = Effect.fn(
    "SystemConfigService.getConfig",
  )(function* () {
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

export class SystemConfigService extends Context.Service<
  SystemConfigService,
  SystemConfigServiceShape
>()("@bakarr/api/SystemConfigService") {
  static readonly layer = Layer.effect(SystemConfigService, makeSystemConfigService());
}

export const SystemConfigServiceLive = SystemConfigService.layer;

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
    rtorrent: {
      ...config.rtorrent,
    },
  } satisfies Config;
}
