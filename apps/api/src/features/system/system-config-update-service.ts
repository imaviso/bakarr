import { count, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { AppConfig } from "@/config/schema.ts";
import { type AppDatabase, Database, DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { RuntimeLogLevelState } from "@/infra/logging.ts";
import { BackgroundWorkerController } from "@/background/controller-core.ts";
import { EventBus } from "@/features/events/event-bus.ts";
import { persistAndActivateConfig } from "@/features/system/config-activation.ts";
import { validateConfigUpdate } from "@/features/system/config-update-validation.ts";
import {
  decodeStoredConfigRow,
  normalizeConfig,
  toConfigCore,
  type ConfigCore,
} from "@/features/system/config-codec.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "@/features/system/errors.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { applyRuntimeLogLevelFromConfig } from "@/features/system/runtime-config.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { buildPersistedConfigStates } from "@/features/system/system-config-update-support.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
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
    const rows = yield* tryDatabasePromise("Failed to count media", () =>
      db.select({ value: count() }).from(media).where(eq(media.profileName, profileName)),
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
    const effectiveConfig = yield* preserveStoredPasswords({
      appDatabaseFile: appConfig.databaseFile,
      nextConfig,
      previousConfigRow,
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

const preserveStoredPasswords = Effect.fn("SystemConfigUpdateService.preserveStoredPasswords")(
  function* (input: {
    readonly appDatabaseFile: string;
    readonly nextConfig: Config;
    readonly previousConfigRow:
      | {
          readonly data: string;
          readonly id: number;
          readonly updatedAt: string;
        }
      | undefined;
  }) {
    const storedConfigResult = yield* decodeStoredConfigRow(input.previousConfigRow).pipe(
      Effect.map((storedConfig) => ({ _tag: "Stored" as const, storedConfig })),
      Effect.catchTag("StoredConfigMissingError", () =>
        Effect.succeed({
          _tag: "Stored" as const,
          storedConfig: makeDefaultConfig(input.appDatabaseFile) satisfies ConfigCore,
        }),
      ),
      Effect.catchTag("StoredConfigCorruptError", () =>
        Effect.succeed({ _tag: "Corrupt" as const }),
      ),
    );

    if (storedConfigResult._tag === "Corrupt") {
      if (
        input.nextConfig.qbittorrent.enabled &&
        Option.isNone(toNonEmptyPasswordOption(input.nextConfig.qbittorrent.password))
      ) {
        return yield* new StoredConfigCorruptError({
          cause: new Error(
            "Stored configuration is corrupt. Re-enter the qBittorrent password before saving repaired config.",
          ),
          message:
            "Stored configuration is corrupt. Re-enter the qBittorrent password before saving repaired config.",
        });
      }

      if (
        input.nextConfig.metadata?.anidb.enabled &&
        Option.isNone(toNonEmptyPasswordOption(input.nextConfig.metadata.anidb.password))
      ) {
        return yield* new StoredConfigCorruptError({
          cause: new Error(
            "Stored configuration is corrupt. Re-enter the AniDB password before saving repaired config.",
          ),
          message:
            "Stored configuration is corrupt. Re-enter the AniDB password before saving repaired config.",
        });
      }

      return input.nextConfig;
    }

    let nextConfig = input.nextConfig;
    const storedQBitPassword = toNonEmptyPasswordOption(
      storedConfigResult.storedConfig.qbittorrent.password,
    );

    if (
      nextConfig.qbittorrent.enabled &&
      Option.isNone(toNonEmptyPasswordOption(nextConfig.qbittorrent.password)) &&
      Option.isSome(storedQBitPassword)
    ) {
      nextConfig = {
        ...nextConfig,
        qbittorrent: {
          ...nextConfig.qbittorrent,
          password: storedQBitPassword.value,
        },
      };
    }

    if (!nextConfig.metadata?.anidb) {
      return nextConfig;
    }

    const storedAniDbPassword = toNonEmptyPasswordOption(
      storedConfigResult.storedConfig.metadata?.anidb?.password,
    );

    if (
      nextConfig.metadata.anidb.enabled &&
      Option.isNone(toNonEmptyPasswordOption(nextConfig.metadata.anidb.password)) &&
      Option.isSome(storedAniDbPassword)
    ) {
      return {
        ...nextConfig,
        metadata: {
          ...nextConfig.metadata,
          anidb: {
            ...nextConfig.metadata.anidb,
            password: storedAniDbPassword.value,
          },
        },
      };
    }

    return nextConfig;
  },
);

function toNonEmptyPasswordOption(value: string | null | undefined): Option.Option<string> {
  if (value === null || value === undefined) {
    return Option.none();
  }

  return value.trim().length > 0 ? Option.some(value) : Option.none();
}
