import { count, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { AppConfig } from "@/config/schema.ts";
import { type AppDatabase, Database, DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { RuntimeLogLevelState } from "@/infra/logging.ts";
import { BackgroundWorkerController } from "@/background/controller-core.ts";
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
  preserveStoredPasswords,
  resolveCurrentAniDbPasswordState,
  buildPersistedConfigStates,
  resolveCurrentQBitPasswordState,
} from "@/features/system/system-config-update-support.ts";
import { listQualityProfileRows } from "@/features/system/repository/quality-profile-repository.ts";
import { loadSystemConfigRow } from "@/features/system/repository/system-config-repository.ts";
import { updateSystemConfigAtomic } from "@/features/system/repository/config-transaction-repository.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export interface SystemConfigUpdateServiceShape {
  readonly updateConfig: (
    config: Config,
  ) => Effect.Effect<Config, DatabaseError | ConfigValidationError | StoredConfigCorruptError>;
}

export class SystemConfigUpdateService extends Context.Tag("@bakarr/api/SystemConfigUpdateService")<
  SystemConfigUpdateService,
  SystemConfigUpdateServiceShape
>() {}

const countAnimeUsingProfile = Effect.fn("SystemConfigUpdateService.countAnimeUsingProfile")(
  function* (db: AppDatabase, profileName: string) {
    const rows = yield* tryDatabasePromise("Failed to count anime", () =>
      db.select({ value: count() }).from(anime).where(eq(anime.profileName, profileName)),
    );
    return rows[0]?.value ?? 0;
  },
);

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
    const effectiveConfig = preserveStoredPasswords({
      aniDbPassword: currentAniDbPassword,
      nextConfig,
      qBitPassword: currentPassword,
    });
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
