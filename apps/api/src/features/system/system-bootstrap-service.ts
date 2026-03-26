import { Context, Effect, Layer } from "effect";

import { AppConfig } from "../../config.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { setRuntimeLogLevel } from "../../lib/logging.ts";
import { DEFAULT_PROFILES, makeDefaultConfig } from "./defaults.ts";
import {
  effectDecodeConfigCore,
  encodeConfigCore,
  encodeQualityProfileRow,
} from "./config-codec.ts";
import {
  insertQualityProfileRows,
  insertSystemConfigRow,
  loadAnyQualityProfileRow,
  loadSystemConfigRow,
} from "./repository.ts";
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
  const nowIso = () => nowIsoFromClock(clock);

  const ensureInitialized = Effect.fn("SystemBootstrapService.ensureInitialized")(function* () {
    const configRow = yield* loadSystemConfigRow(db);

    if (!configRow) {
      const initNow = yield* nowIso();
      yield* insertSystemConfigRow(db, {
        data: encodeConfigCore(makeDefaultConfig(config.databaseFile)),
        id: 1,
        updatedAt: initNow,
      });
    }

    const existingProfile = yield* loadAnyQualityProfileRow(db);

    if (!existingProfile) {
      yield* insertQualityProfileRows(db, DEFAULT_PROFILES.map(encodeQualityProfileRow));
    }

    const storedConfig = yield* loadSystemConfigRow(db);

    if (storedConfig) {
      const decoded = yield* effectDecodeConfigCore(storedConfig.data).pipe(Effect.either);

      if (decoded._tag === "Right") {
        yield* setRuntimeLogLevel(decoded.right.general.log_level);
      }
    }
  });

  return { ensureInitialized } satisfies SystemBootstrapServiceShape;
});

export const SystemBootstrapServiceLive = Layer.effect(
  SystemBootstrapService,
  makeSystemBootstrapService,
);
