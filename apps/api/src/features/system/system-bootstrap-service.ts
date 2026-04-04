import { Context, Effect, Layer } from "effect";
import { eq } from "drizzle-orm";

import { AppConfig } from "@/config.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { appConfig, qualityProfiles } from "@/db/schema.ts";
import { nowIsoFromClock, ClockService } from "@/lib/clock.ts";
import { RuntimeLogLevelState } from "@/lib/logging.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { DEFAULT_PROFILES, makeDefaultConfig } from "@/features/system/defaults.ts";
import {
  decodeConfigCore,
  encodeConfigCore,
  encodeQualityProfileRow,
} from "@/features/system/config-codec.ts";
import { applyRuntimeLogLevelFromConfig } from "@/features/system/runtime-config.ts";
import { loadSystemConfigRow } from "@/features/system/repository/system-config-repository.ts";
export interface SystemBootstrapServiceShape {
  /**
   * First-run initialization (idempotent):
   * - Insert default system config row if none exists.
   * - Insert default quality profiles if none exist.
   * - Apply the stored log level when config is decodable.
   *
   * Corrupt rows are skipped here.
   */
  readonly ensureInitialized: () => Effect.Effect<void, DatabaseError>;
}

export class SystemBootstrapService extends Context.Tag("@bakarr/api/SystemBootstrapService")<
  SystemBootstrapService,
  SystemBootstrapServiceShape
>() {}

const makeSystemBootstrapService = Effect.gen(function* () {
  const { db } = yield* Database;
  const config = yield* AppConfig;
  const clock = yield* ClockService;
  const runtimeLogLevelState = yield* RuntimeLogLevelState;
  const nowIso = () => nowIsoFromClock(clock);

  const ensureInitialized = Effect.fn("SystemBootstrapService.ensureInitialized")(function* () {
    const initNow = yield* nowIso();
    const initialConfigData = yield* encodeConfigCore(makeDefaultConfig(config.databaseFile)).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({
            cause,
            message: "Failed to ensure bootstrap system state",
          }),
      ),
    );
    const initialProfiles = yield* Effect.forEach(DEFAULT_PROFILES, encodeQualityProfileRow).pipe(
      Effect.mapError(
        (cause) =>
          new DatabaseError({
            cause,
            message: "Failed to ensure bootstrap system state",
          }),
      ),
    );

    yield* tryDatabasePromise("Failed to ensure bootstrap system state", () =>
      db.transaction(async (tx) => {
        const configRows = await tx.select().from(appConfig).where(eq(appConfig.id, 1)).limit(1);

        if (configRows.length === 0) {
          await tx.insert(appConfig).values({
            data: initialConfigData,
            id: 1,
            updatedAt: initNow,
          });
        }

        const existingProfiles = await tx.select().from(qualityProfiles).limit(1);

        if (existingProfiles.length === 0) {
          await tx.insert(qualityProfiles).values(initialProfiles);
        }
      }),
    );

    const storedConfig = yield* loadSystemConfigRow(db);

    if (storedConfig) {
      const decoded = yield* decodeConfigCore(storedConfig.data).pipe(Effect.either);

      if (decoded._tag === "Right") {
        yield* applyRuntimeLogLevelFromConfig(runtimeLogLevelState, decoded.right);
      }
    }
  });

  return { ensureInitialized } satisfies SystemBootstrapServiceShape;
});

export const SystemBootstrapServiceLive = Layer.effect(
  SystemBootstrapService,
  makeSystemBootstrapService,
);
