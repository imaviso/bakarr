import { Context, Effect, Layer, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { AppConfig } from "@/config.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { RuntimeLogLevelState } from "@/lib/logging.ts";
import { BackgroundWorkerController } from "@/background-controller-core.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { persistAndActivateConfig } from "@/features/system/config-activation.ts";
import { validateConfigUpdate } from "@/features/system/config-update-validation.ts";
import { toConfigCore } from "@/features/system/config-codec.ts";
import { normalizeConfig } from "@/features/system/system-config-normalization.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "@/features/system/errors.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { applyRuntimeLogLevelFromConfig } from "@/features/system/runtime-config.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import {
  resolveCurrentAniDbPasswordState,
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
  const eventBus = yield* EventBus;
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
    const currentAniDbPassword = yield* resolveCurrentAniDbPasswordState({
      appDatabaseFile: appConfig.databaseFile,
      nextConfig,
      previousConfigRow,
    });
    const effectiveConfig = preserveStoredAniDbPassword(
      currentAniDbPassword,
      preserveStoredQBitPassword(currentPassword, nextConfig),
    );
    const normalizedConfig = yield* normalizeConfig(effectiveConfig);
    yield* validateConfigUpdate({
      countAnimeUsingProfile: (profileName) => countAnimeUsingProfile(db, profileName),
      existingProfileRows,
      nextConfig: normalizedConfig,
    });

    const updatedAt = yield* nowIso();
    const normalizedCore = yield* toConfigCore(normalizedConfig);
    const { nextState, previousState } = yield* buildPersistedConfigStates({
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
    yield* eventBus.publishInfo("System configuration updated");

    return normalizedConfig;
  });

  return { updateConfig } satisfies SystemConfigUpdateServiceShape;
});

export const SystemConfigUpdateServiceLive = Layer.effect(
  SystemConfigUpdateService,
  makeSystemConfigUpdateService,
);

function preserveStoredQBitPassword(
  currentPassword: Option.Option<string>,
  nextConfig: Config,
): Config {
  return preserveStoredPassword({
    currentPassword,
    enabled: nextConfig.qbittorrent.enabled,
    nextConfig,
    nextPassword: nextConfig.qbittorrent.password,
    setPassword: (config, password) => ({
      ...config,
      qbittorrent: {
        ...config.qbittorrent,
        password,
      },
    }),
  });
}

function preserveStoredAniDbPassword(
  currentPassword: Option.Option<string>,
  nextConfig: Config,
): Config {
  if (!nextConfig.metadata?.anidb) {
    return nextConfig;
  }

  const nextAniDb = nextConfig.metadata.anidb;

  return preserveStoredPassword({
    currentPassword,
    enabled: nextAniDb.enabled,
    nextConfig,
    nextPassword: nextAniDb.password,
    setPassword: (config, password) => ({
      ...config,
      metadata: {
        ...config.metadata,
        anidb: {
          ...nextAniDb,
          password,
        },
      },
    }),
  });
}

function preserveStoredPassword(input: {
  readonly currentPassword: Option.Option<string>;
  readonly enabled: boolean;
  readonly nextConfig: Config;
  readonly nextPassword: string | null | undefined;
  readonly setPassword: (config: Config, password: string) => Config;
}): Config {
  if (!input.enabled || Option.isSome(toNonEmptyPasswordOption(input.nextPassword))) {
    return input.nextConfig;
  }

  if (Option.isNone(input.currentPassword)) {
    return input.nextConfig;
  }

  return input.setPassword(input.nextConfig, input.currentPassword.value);
}

function toNonEmptyPasswordOption(value: string | null | undefined): Option.Option<string> {
  if (value === null || value === undefined) {
    return Option.none();
  }

  return value.trim().length > 0 ? Option.some(value) : Option.none();
}
