import { Effect } from "effect";

import { AppConfig } from "@/config/schema.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import { RuntimeLogLevelState } from "@/infra/logging.ts";
import { DEFAULT_PROFILES, makeDefaultConfig } from "@/features/system/defaults.ts";
import { decodeConfigCore, encodeConfigCore } from "@/features/system/config-codec.ts";
import { encodeQualityProfileRow } from "@/features/profiles/profile-codec.ts";
import { applyRuntimeLogLevelFromConfig } from "@/features/system/runtime-config.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";

const makeSystemBootstrapService = Effect.fn("SystemBootstrapService.make")(function* () {
  const config = yield* AppConfig;
  const clock = yield* ClockService;
  const runtimeLogLevelState = yield* RuntimeLogLevelState;
  const systemConfigRepository = yield* SystemConfigRepository;
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

    yield* systemConfigRepository.ensureBootstrapSystemState(
      {
        data: initialConfigData,
        id: 1,
        updatedAt: initNow,
      },
      initialProfiles,
    );

    const storedConfig = yield* systemConfigRepository.loadSystemConfigRow();

    if (storedConfig) {
      const decoded = yield* decodeConfigCore(storedConfig.data).pipe(Effect.either);

      if (decoded._tag === "Right") {
        yield* applyRuntimeLogLevelFromConfig(runtimeLogLevelState, decoded.right);
      }
    }
  });

  return { ensureInitialized };
});

export class SystemBootstrapService extends Effect.Service<SystemBootstrapService>()(
  "@bakarr/api/SystemBootstrapService",
  {
    effect: makeSystemBootstrapService(),
  },
) {}

export const SystemBootstrapServiceLive = SystemBootstrapService.Default;
