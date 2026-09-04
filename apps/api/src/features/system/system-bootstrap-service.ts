import { AppConfig } from "@/app/config/schema.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { RuntimeLogLevelState } from "@/infra/logging.ts";
import { DEFAULT_PROFILES, makeDefaultConfig } from "@/features/system/defaults.ts";
import { decodeConfigCore, encodeConfigCore } from "@/features/system/config-codec.ts";
import { encodeQualityProfileRow } from "@/features/system/profile-codec.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import { Context, Effect, Layer } from "effect";

const makeSystemBootstrapService = Effect.fn("SystemBootstrapService.make")(function* () {
  const config = yield* AppConfig;
  const runtimeLogLevelState = yield* RuntimeLogLevelState;
  const systemConfigRepository = yield* SystemConfigRepository;
  const nowIso = currentNowIso;

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
      const decoded = yield* decodeConfigCore(storedConfig.data).pipe(Effect.result);

      if (decoded._tag === "Success") {
        yield* runtimeLogLevelState.set(decoded.success.general.log_level);
      }
    }
  });

  return { ensureInitialized } satisfies SystemBootstrapServiceShape;
});

export interface SystemBootstrapServiceShape {
  readonly ensureInitialized: () => Effect.Effect<void, DatabaseError>;
}

export class SystemBootstrapService extends Context.Service<
  SystemBootstrapService,
  SystemBootstrapServiceShape
>()("@bakarr/api/SystemBootstrapService") {
  static readonly layer = Layer.effect(SystemBootstrapService, makeSystemBootstrapService());
}

export const SystemBootstrapServiceLive = SystemBootstrapService.layer;
