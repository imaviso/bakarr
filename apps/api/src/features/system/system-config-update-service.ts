import { Context, Effect, Layer } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { AppConfig } from "../../config.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { BackgroundWorkerController } from "../../background-controller.ts";
import { persistAndActivateConfig, type PersistedSystemConfigState } from "./config-activation.ts";
import { validateConfigUpdate } from "./config-update-validation.ts";
import {
  type ConfigCore,
  encodeConfigCore,
  encodeQualityProfileRow,
  toConfigCore,
} from "./config-codec.ts";
import { normalizeConfig } from "./qbittorrent-config.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "./errors.ts";
import { makeDefaultConfig } from "./defaults.ts";
import { appendSystemLog } from "./support.ts";
import { applyRuntimeLogLevelFromConfig } from "./runtime-config.ts";
import { countAnimeUsingProfile } from "./repository/profile-usage-repository.ts";
import { listQualityProfileRows } from "./repository/quality-profile-repository.ts";
import { loadSystemConfigRow } from "./repository/system-config-repository.ts";
import { updateSystemConfigAtomic } from "./repository/config-transaction-repository.ts";

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
  const nowIso = () => nowIsoFromClock(clock);

  const updateConfig = Effect.fn("SystemConfigUpdateService.updateConfig")(function* (
    nextConfig: Config,
  ) {
    const existingProfileRows = yield* listQualityProfileRows(db);
    const normalizedConfig = yield* normalizeConfig(nextConfig);
    yield* validateConfigUpdate({
      countAnimeUsingProfile: (profileName) => countAnimeUsingProfile(db, profileName),
      existingProfileRows,
      nextConfig: normalizedConfig,
    });

    const core: ConfigCore = toConfigCore(normalizedConfig);
    const updatedAt = yield* nowIso();
    const previousConfigRow = yield* loadSystemConfigRow(db);
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
      activateConfig: (value) => runtimeControl.reload(value),
      nextConfig: normalizedConfig,
      nextState,
      persistState: (state) => updateSystemConfigAtomic(db, state.coreRow, state.profileRows),
      previousState,
    });

    yield* applyRuntimeLogLevelFromConfig(normalizedConfig);

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
