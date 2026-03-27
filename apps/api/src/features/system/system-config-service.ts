import { Context, Effect, Layer } from "effect";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { AppConfig } from "../../config.ts";
import { BackgroundWorkerController } from "../../background-controller.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { persistAndActivateConfig, type PersistedSystemConfigState } from "./config-activation.ts";
import { validateConfigUpdate } from "./config-update-validation.ts";
import {
  type ConfigCore,
  composeConfig,
  effectDecodeStoredConfigRow,
  effectDecodeQualityProfileRow,
  encodeConfigCore,
  encodeQualityProfileRow,
  toConfigCore,
} from "./config-codec.ts";
import {
  ConfigValidationError,
  StoredConfigCorruptError,
  StoredConfigMissingError,
} from "./errors.ts";
import { makeDefaultConfig } from "./defaults.ts";
import { appendSystemLog } from "./support.ts";
import { applyRuntimeLogLevelFromConfig } from "./runtime-config.ts";
import {
  countAnimeUsingProfile,
  listQualityProfileRows,
  loadSystemConfigRow,
  updateSystemConfigAtomic,
} from "./repository/config-repository.ts";

export interface SystemConfigServiceShape {
  readonly getConfig: () => Effect.Effect<
    Config,
    DatabaseError | StoredConfigCorruptError | StoredConfigMissingError
  >;
  readonly updateConfig: (
    config: Config,
  ) => Effect.Effect<Config, DatabaseError | ConfigValidationError | StoredConfigCorruptError>;
}

export class SystemConfigService extends Context.Tag("@bakarr/api/SystemConfigService")<
  SystemConfigService,
  SystemConfigServiceShape
>() {}

const makeSystemConfigService = Effect.gen(function* () {
  const { db } = yield* Database;
  const appConfig = yield* AppConfig;
  const clock = yield* ClockService;
  const workerController = yield* BackgroundWorkerController;
  const nowIso = () => nowIsoFromClock(clock);

  const getConfig = Effect.fn("SystemConfigService.getConfig")(function* () {
    const storedConfig = yield* loadSystemConfigRow(db);
    const profiles = yield* listQualityProfileRows(db);

    const core = yield* effectDecodeStoredConfigRow(storedConfig).pipe(
      Effect.catchTag("StoredConfigCorruptError", () =>
        Effect.fail(
          new StoredConfigCorruptError({
            message:
              "Stored configuration is corrupt and could not be decoded. Re-save config to repair.",
          }),
        ),
      ),
    );
    const decodedProfiles = yield* Effect.forEach(profiles, effectDecodeQualityProfileRow);

    return composeConfig(core, decodedProfiles);
  });

  const updateConfig = Effect.fn("SystemConfigService.updateConfig")(function* (
    nextConfig: Config,
  ) {
    const existingProfileRows = yield* listQualityProfileRows(db);
    yield* validateConfigUpdate({
      countAnimeUsingProfile: (profileName) => countAnimeUsingProfile(db, profileName),
      existingProfileRows,
      nextConfig,
    });

    const core: ConfigCore = toConfigCore(nextConfig);
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
      profileRows: nextConfig.profiles.map(encodeQualityProfileRow),
    };

    yield* persistAndActivateConfig({
      activateConfig: (value) => workerController.reload(value),
      nextConfig,
      nextState,
      persistState: (state) => updateSystemConfigAtomic(db, state.coreRow, state.profileRows),
      previousState,
    });

    yield* applyRuntimeLogLevelFromConfig(nextConfig);

    yield* appendSystemLog(
      db,
      "system.config.updated",
      "success",
      "System configuration updated",
      nowIso,
    );

    return nextConfig;
  });

  return { getConfig, updateConfig } satisfies SystemConfigServiceShape;
});

export const SystemConfigServiceLive = Layer.effect(SystemConfigService, makeSystemConfigService);
