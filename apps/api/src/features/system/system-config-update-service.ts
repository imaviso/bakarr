import { Context, Effect, Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { AppConfig } from "@/config.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { RuntimeLogLevelState } from "@/lib/logging.ts";
import { BackgroundWorkerController } from "@/background-controller-core.ts";
import {
  persistAndActivateConfig,
  type PersistedSystemConfigState,
} from "@/features/system/config-activation.ts";
import { validateConfigUpdate } from "@/features/system/config-update-validation.ts";
import {
  effectDecodeStoredConfigRow,
  type ConfigCore,
  encodeConfigCore,
  encodeQualityProfileRow,
  toConfigCore,
} from "@/features/system/config-codec.ts";
import { normalizeConfig } from "@/features/system/qbittorrent-config.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "@/features/system/errors.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { applyRuntimeLogLevelFromConfig } from "@/features/system/runtime-config.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { countAnimeUsingProfile } from "@/features/system/repository/profile-usage-repository.ts";
import { listQualityProfileRows } from "@/features/system/repository/quality-profile-repository.ts";
import { loadSystemConfigRow } from "@/features/system/repository/system-config-repository.ts";
import { updateSystemConfigAtomic } from "@/features/system/repository/config-transaction-repository.ts";

export interface SystemConfigUpdateServiceShape {
  readonly updateConfig: (
    config: Config,
  ) => Effect.Effect<Config, DatabaseError | ConfigValidationError | StoredConfigCorruptError>;
}

export class SystemConfigUpdateService extends Context.Tag("@bakarr/api/SystemConfigUpdateService")<
  SystemConfigUpdateService,
  SystemConfigUpdateServiceShape
>() {}

const makeSystemConfigUpdateService = Effect.gen(function* () {
  const { db } = yield* Database;
  const appConfig = yield* AppConfig;
  const clock = yield* ClockService;
  const runtimeControl = yield* BackgroundWorkerController;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const runtimeLogLevelState = yield* RuntimeLogLevelState;
  const nowIso = () => nowIsoFromClock(clock);

  const updateConfig = Effect.fn("SystemConfigUpdateService.updateConfig")(function* (
    nextConfig: Config,
  ) {
    const existingProfileRows = yield* listQualityProfileRows(db);
    const previousConfigRow = yield* loadSystemConfigRow(db);
    const currentPasswordResult = yield* effectDecodeStoredConfigRow(previousConfigRow).pipe(
      Effect.map((config) => ({
        password: config.qbittorrent.password,
        storedConfigCorrupt: false,
      })),
      Effect.catchTag("StoredConfigMissingError", () =>
        Effect.succeed({
          password: makeDefaultConfig(appConfig.databaseFile).qbittorrent.password,
          storedConfigCorrupt: false,
        }),
      ),
      Effect.catchTag("StoredConfigCorruptError", () =>
        Effect.succeed({
          password: null,
          storedConfigCorrupt: true,
        }),
      ),
    );

    if (
      currentPasswordResult.storedConfigCorrupt &&
      nextConfig.qbittorrent.enabled &&
      !nextConfig.qbittorrent.password?.trim()
    ) {
      return yield* new StoredConfigCorruptError({
        message:
          "Stored configuration is corrupt. Re-enter the qBittorrent password before saving repaired config.",
      });
    }

    const effectiveConfig = preserveStoredQBitPassword(currentPasswordResult.password, nextConfig);
    const normalizedConfig = yield* normalizeConfig(effectiveConfig);
    yield* validateConfigUpdate({
      countAnimeUsingProfile: (profileName) => countAnimeUsingProfile(db, profileName),
      existingProfileRows,
      nextConfig: normalizedConfig,
    });

    const core: ConfigCore = toConfigCore(normalizedConfig);
    const updatedAt = yield* nowIso();
    const previousState: PersistedSystemConfigState = {
      coreRow: previousConfigRow
        ? {
            data: previousConfigRow.data,
            id: previousConfigRow.id,
            updatedAt: previousConfigRow.updatedAt,
          }
        : {
            data: encodeConfigCore(makeDefaultConfig(appConfig.databaseFile)),
            id: 1,
            updatedAt,
          },
      profileRows: existingProfileRows,
    };
    const nextState: PersistedSystemConfigState = {
      coreRow: { data: encodeConfigCore(core), id: 1, updatedAt },
      profileRows: normalizedConfig.profiles.map(encodeQualityProfileRow),
    };

    yield* persistAndActivateConfig({
      activateConfig: (value) =>
        runtimeControl
          .reload(value)
          .pipe(Effect.zipRight(runtimeConfigSnapshot.replaceRuntimeConfig(value))),
      nextConfig: normalizedConfig,
      nextState,
      persistState: (state) => updateSystemConfigAtomic(db, state.coreRow, state.profileRows),
      previousState,
    });

    yield* applyRuntimeLogLevelFromConfig(runtimeLogLevelState, normalizedConfig);

    yield* appendSystemLog(
      db,
      "system.config.updated",
      "success",
      "System configuration updated",
      nowIso,
    );

    return normalizedConfig;
  });

  return { updateConfig } satisfies SystemConfigUpdateServiceShape;
});

export const SystemConfigUpdateServiceLive = Layer.effect(
  SystemConfigUpdateService,
  makeSystemConfigUpdateService,
);

function preserveStoredQBitPassword(
  currentPassword: string | null | undefined,
  nextConfig: Config,
): Config {
  const nextPassword = nextConfig.qbittorrent.password?.trim();

  if (!nextConfig.qbittorrent.enabled || nextPassword) {
    return nextConfig;
  }

  if (!currentPassword) {
    return nextConfig;
  }

  return {
    ...nextConfig,
    qbittorrent: {
      ...nextConfig.qbittorrent,
      password: currentPassword,
    },
  } satisfies Config;
}
