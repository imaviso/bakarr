import { Context, Effect, Either, Layer } from "effect";
import * as Cron from "effect/Cron";

import type { Config } from "../../../../../packages/shared/src/index.ts";
import { AppConfig } from "../../config.ts";
import { BackgroundWorkerController } from "../../background-controller.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { setRuntimeLogLevel } from "../../lib/logging.ts";
import { persistAndActivateConfig, type PersistedSystemConfigState } from "./config-activation.ts";
import {
  type ConfigCore,
  composeConfig,
  effectDecodeStoredConfigRow,
  effectDecodeQualityProfileRow,
  encodeConfigCore,
  encodeQualityProfileRow,
  toConfigCore,
  withLibraryDefaults,
} from "./config-codec.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "./errors.ts";
import { makeDefaultConfig } from "./defaults.ts";
import { appendSystemLog } from "./support.ts";
import {
  countAnimeUsingProfile,
  loadSystemConfigRow,
  listQualityProfileRows,
  updateSystemConfigAtomic,
} from "./repository.ts";

export interface SystemConfigServiceShape {
  readonly getConfig: () => Effect.Effect<Config, DatabaseError | StoredConfigCorruptError>;
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
      Effect.catchTag("StoredConfigMissingError", () =>
        Effect.succeed(makeDefaultConfig(appConfig.databaseFile)),
      ),
      Effect.catchTag("StoredConfigCorruptError", () =>
        Effect.fail(
          new StoredConfigCorruptError({
            message:
              "Stored configuration is corrupt and could not be decoded. Re-save config to repair.",
          }),
        ),
      ),
    );
    const defaults = makeDefaultConfig(appConfig.databaseFile);
    const decodedProfiles = yield* Effect.forEach(profiles, effectDecodeQualityProfileRow);

    return composeConfig(withLibraryDefaults(core, defaults.library), decodedProfiles);
  });

  const updateConfig = Effect.fn("SystemConfigService.updateConfig")(function* (
    nextConfig: Config,
  ) {
    const cronExpression = nextConfig.scheduler.cron_expression?.trim();

    if (nextConfig.scheduler.enabled && cronExpression) {
      const parsed = Cron.parse(cronExpression);

      if (Either.isLeft(parsed)) {
        return yield* new ConfigValidationError({
          message: "Invalid scheduler cron expression",
        });
      }
    }

    const existingProfileRows = yield* listQualityProfileRows(db);

    const keptProfileNames = new Set(nextConfig.profiles.map((p) => p.name));
    const removedProfileNames = existingProfileRows
      .map((row) => row.name)
      .filter((name) => !keptProfileNames.has(name));

    for (const removedProfileName of removedProfileNames) {
      const referencingAnime = yield* countAnimeUsingProfile(db, removedProfileName);

      if (referencingAnime > 0) {
        return yield* new ConfigValidationError({
          message: `Cannot remove profile '${removedProfileName}': still referenced by ${referencingAnime} anime`,
        });
      }
    }

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

    yield* appendSystemLog(
      db,
      "system.config.updated",
      "success",
      "System configuration updated",
      nowIso,
    );

    setRuntimeLogLevel(nextConfig.general.log_level);

    return nextConfig;
  });

  return { getConfig, updateConfig } satisfies SystemConfigServiceShape;
});

export const SystemConfigServiceLive = Layer.effect(SystemConfigService, makeSystemConfigService);
