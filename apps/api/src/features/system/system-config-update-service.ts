import { Context, Effect, Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { AppConfig } from "@/config.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { RuntimeLogLevelState } from "@/lib/logging.ts";
import { BackgroundWorkerController } from "@/background-controller-core.ts";
import { persistAndActivateConfig } from "@/features/system/config-activation.ts";
import { validateConfigUpdate } from "@/features/system/config-update-validation.ts";
import { effectToConfigCore } from "@/features/system/config-codec.ts";
import { normalizeConfig } from "@/features/system/qbittorrent-config.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "@/features/system/errors.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { applyRuntimeLogLevelFromConfig } from "@/features/system/runtime-config.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import {
  buildPersistedConfigStates,
  resolveCurrentQBitPasswordState,
} from "@/features/system/system-config-update-support.ts";
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
    const currentPassword = yield* resolveCurrentQBitPasswordState({
      appDatabaseFile: appConfig.databaseFile,
      nextConfig,
      previousConfigRow,
    });
    const effectiveConfig = preserveStoredQBitPassword(currentPassword, nextConfig);
    const normalizedConfig = yield* normalizeConfig(effectiveConfig);
    yield* validateConfigUpdate({
      countAnimeUsingProfile: (profileName) => countAnimeUsingProfile(db, profileName),
      existingProfileRows,
      nextConfig: normalizedConfig,
    });

    const updatedAt = yield* nowIso();
    const normalizedCore = yield* effectToConfigCore(normalizedConfig);
    const { nextState, previousState } = buildPersistedConfigStates({
      appDatabaseFile: appConfig.databaseFile,
      existingProfileRows,
      normalizedConfig,
      normalizedCore,
      previousConfigRow,
      updatedAt,
    });

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
