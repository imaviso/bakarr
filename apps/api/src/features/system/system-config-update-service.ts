import { Effect, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import { AppConfig } from "@/app/config/schema.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { RuntimeLogLevelState } from "@/infra/logging.ts";
import { BackgroundWorkerController } from "@/background/controller-core.ts";
import { EventBus } from "@/infra/effect/event-bus.ts";
import { persistAndActivateConfig } from "@/features/system/config-activation.ts";
import { validateConfigUpdate } from "@/features/system/config-update-validation.ts";
import {
  decodeStoredConfigRow,
  normalizeConfig,
  toConfigCore,
  type ConfigCore,
} from "@/features/system/config-codec.ts";
import { ConfigValidationError, StoredConfigCorruptError } from "@/features/system/errors.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { applyRuntimeLogLevelFromConfig } from "@/features/system/runtime-config.ts";
import { RuntimeConfigSnapshotService } from "@/features/system/runtime-config-snapshot-service.ts";
import { buildPersistedConfigStates } from "@/features/system/system-config-update-support.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { SystemConfigRepository } from "@/features/system/repository/system-config-repository.ts";
import {
  applyPasswordPreservation,
  validateCorruptStatePasswords,
} from "@/features/system/config-password-policy.ts";

export interface SystemConfigUpdateServiceShape {
  readonly updateConfig: (
    config: Config,
  ) => Effect.Effect<Config, DatabaseError | ConfigValidationError | StoredConfigCorruptError>;
}

type PreservedPasswordState =
  | { readonly _tag: "Stored"; readonly storedConfig: ConfigCore }
  | { readonly _tag: "Corrupt" };

const makeSystemConfigUpdateService = Effect.fn("SystemConfigUpdateService.make")(function* () {
  const appConfig = yield* AppConfig;
  const qualityProfileRepository = yield* QualityProfileRepository;
  const runtimeControl = yield* BackgroundWorkerController;
  const runtimeConfigSnapshot = yield* RuntimeConfigSnapshotService;
  const runtimeLogLevelState = yield* RuntimeLogLevelState;
  const systemConfigRepository = yield* SystemConfigRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const eventBus = yield* EventBus;
  const nowIso = currentNowIso;
  const updateSemaphore = yield* Effect.makeSemaphore(1);

  const updateConfig = Effect.fn("SystemConfigUpdateService.updateConfig")(function* (
    nextConfig: Config,
  ) {
    return yield* updateSemaphore.withPermits(1)(
      Effect.gen(function* () {
        const existingProfileRows = yield* qualityProfileRepository.listQualityProfileRows();
        const previousConfigRow = yield* systemConfigRepository.loadSystemConfigRow();
        const effectiveConfig = yield* preserveStoredPasswords({
          appDatabaseFile: appConfig.databaseFile,
          nextConfig,
          previousConfigRow,
        });
        const normalizedConfig = yield* normalizeConfig(effectiveConfig);
        yield* validateConfigUpdate({
          countMediaUsingProfile: (profileName) =>
            qualityProfileRepository.countMediaUsingProfile(profileName),
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
          // Snapshot first, reload second: worker reload is the only step that
          // can fail, and it must run while snapshot + workers still agree on
          // the old config — a failure then leaves a consistent old state for
          // the DB rollback to restore. Reversing the order would strand
          // readers on the old snapshot while workers act on the new config.
          activateConfig: (value) =>
            runtimeConfigSnapshot
              .replaceRuntimeConfig(value)
              .pipe(Effect.zipRight(runtimeControl.reload(value))),
          nextConfig: normalizedConfig,
          nextState,
          persistState: (state) =>
            systemConfigRepository.updateSystemConfigAtomic(state.coreRow, state.profileRows),
          previousState,
        });

        yield* applyRuntimeLogLevelFromConfig(runtimeLogLevelState, normalizedConfig);

        yield* systemLogRepository.appendLog(
          "system.config.updated",
          "success",
          "System configuration updated",
          nowIso,
        );
        yield* eventBus.publishInfo("System configuration updated");

        return normalizedConfig;
      }),
    );
  });

  return { updateConfig } satisfies SystemConfigUpdateServiceShape;
});

export class SystemConfigUpdateService extends Effect.Service<SystemConfigUpdateService>()(
  "@bakarr/api/SystemConfigUpdateService",
  {
    dependencies: [
      QualityProfileRepository.Default,
      SystemConfigRepository.Default,
      SystemLogRepository.Default,
    ],
    effect: makeSystemConfigUpdateService(),
  },
) {}

export const SystemConfigUpdateServiceLive = SystemConfigUpdateService.Default;

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
    const storedConfigResult: PreservedPasswordState = yield* decodeStoredConfigRow(
      input.previousConfigRow,
    ).pipe(
      Effect.map((storedConfig): PreservedPasswordState => ({ _tag: "Stored", storedConfig })),
      Effect.catchTag("StoredConfigMissingError", () =>
        Effect.succeed<PreservedPasswordState>({
          _tag: "Stored",
          storedConfig: makeDefaultConfig(input.appDatabaseFile) satisfies ConfigCore,
        }),
      ),
      Effect.catchTag("StoredConfigCorruptError", () =>
        Effect.succeed<PreservedPasswordState>({ _tag: "Corrupt" }),
      ),
    );

    if (storedConfigResult._tag === "Corrupt") {
      const corruptValidation = validateCorruptStatePasswords(input.nextConfig);
      if (Option.isSome(corruptValidation)) {
        return yield* new StoredConfigCorruptError({
          cause: new Error(corruptValidation.value.message),
          message: corruptValidation.value.message,
        });
      }
      return input.nextConfig;
    }

    return applyPasswordPreservation(storedConfigResult.storedConfig, input.nextConfig);
  },
);
