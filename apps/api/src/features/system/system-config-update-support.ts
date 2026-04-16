import { Effect, Option } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { PersistedSystemConfigState } from "@/features/system/config-activation.ts";
import {
  decodeStoredConfigRow,
  encodeConfigCore,
  encodeQualityProfileRow,
  type ConfigCore,
} from "@/features/system/config-codec.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";

interface StoredConfigPasswordState {
  readonly metadata?:
    | {
        readonly anidb?: {
          readonly password?: string | null | undefined;
        };
      }
    | undefined;
  readonly qbittorrent: {
    readonly password?: string | null | undefined;
  };
}

export const resolveCurrentQBitPasswordState = Effect.fn(
  "SystemConfigUpdateService.resolveCurrentQBitPasswordState",
)(function* (input: {
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
  return yield* resolveCurrentStoredPasswordState({
    appDatabaseFile: input.appDatabaseFile,
    currentPasswordMessage:
      "Stored configuration is corrupt. Re-enter the qBittorrent password before saving repaired config.",
    defaultPassword: (config) => config.qbittorrent.password,
    nextPassword: input.nextConfig.qbittorrent.password,
    passwordFromStoredConfig: (config) => config.qbittorrent.password,
    requiresPassword: input.nextConfig.qbittorrent.enabled,
    previousConfigRow: input.previousConfigRow,
  });
});

export const resolveCurrentAniDbPasswordState = Effect.fn(
  "SystemConfigUpdateService.resolveCurrentAniDbPasswordState",
)(function* (input: {
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
  return yield* resolveCurrentStoredPasswordState({
    appDatabaseFile: input.appDatabaseFile,
    currentPasswordMessage:
      "Stored configuration is corrupt. Re-enter the AniDB password before saving repaired config.",
    defaultPassword: (config) => config.metadata?.anidb?.password ?? null,
    nextPassword: input.nextConfig.metadata?.anidb.password,
    passwordFromStoredConfig: (config) => config.metadata?.anidb?.password ?? null,
    requiresPassword: Boolean(input.nextConfig.metadata?.anidb.enabled),
    previousConfigRow: input.previousConfigRow,
  });
});

const resolveCurrentStoredPasswordState = Effect.fn(
  "SystemConfigUpdateService.resolveCurrentStoredPasswordState",
)(function* (input: {
  readonly appDatabaseFile: string;
  readonly currentPasswordMessage: string;
  readonly defaultPassword: (config: StoredConfigPasswordState) => string | null | undefined;
  readonly nextPassword: string | null | undefined;
  readonly passwordFromStoredConfig: (
    config: StoredConfigPasswordState,
  ) => string | null | undefined;
  readonly previousConfigRow:
    | {
        readonly data: string;
        readonly id: number;
        readonly updatedAt: string;
      }
    | undefined;
  readonly requiresPassword: boolean;
}) {
  const currentPasswordResult = yield* decodeStoredConfigRow(input.previousConfigRow).pipe(
    Effect.map((config) => ({
      password: toNonEmptyPasswordOption(input.passwordFromStoredConfig(config)),
      storedConfigCorrupt: false,
    })),
    Effect.catchTag("StoredConfigMissingError", () =>
      Effect.succeed({
        password: toNonEmptyPasswordOption(
          input.defaultPassword(makeDefaultConfig(input.appDatabaseFile)),
        ),
        storedConfigCorrupt: false,
      }),
    ),
    Effect.catchTag("StoredConfigCorruptError", () =>
      Effect.succeed({
        password: Option.none<string>(),
        storedConfigCorrupt: true,
      }),
    ),
  );

  if (
    currentPasswordResult.storedConfigCorrupt &&
    input.requiresPassword &&
    Option.isNone(toNonEmptyPasswordOption(input.nextPassword))
  ) {
    return yield* new StoredConfigCorruptError({
      cause: new Error(input.currentPasswordMessage),
      message: input.currentPasswordMessage,
    });
  }

  return currentPasswordResult.password;
});

function toNonEmptyPasswordOption(value: string | null | undefined): Option.Option<string> {
  if (value === null || value === undefined) {
    return Option.none();
  }

  return value.trim().length > 0 ? Option.some(value) : Option.none();
}

export const buildPersistedConfigStates = Effect.fn(
  "SystemConfigUpdateService.buildPersistedConfigStates",
)(function* (input: {
  readonly appDatabaseFile: string;
  readonly existingProfileRows: readonly {
    readonly allowedQualities: string;
    readonly cutoff: string;
    readonly maxSize: string | null;
    readonly minSize: string | null;
    readonly name: string;
    readonly seadexPreferred: boolean;
    readonly upgradeAllowed: boolean;
  }[];
  readonly normalizedConfig: Config;
  readonly normalizedCore: ConfigCore;
  readonly previousConfigRow:
    | {
        readonly data: string;
        readonly id: number;
        readonly updatedAt: string;
      }
    | undefined;
  readonly updatedAt: string;
}) {
  const defaultConfigData = yield* encodeConfigCore(makeDefaultConfig(input.appDatabaseFile));
  const nextConfigData = yield* encodeConfigCore(input.normalizedCore);
  const nextProfileRows = yield* Effect.forEach(
    input.normalizedConfig.profiles,
    encodeQualityProfileRow,
  );

  const previousState: PersistedSystemConfigState = {
    coreRow: input.previousConfigRow
      ? {
          data: input.previousConfigRow.data,
          id: input.previousConfigRow.id,
          updatedAt: input.previousConfigRow.updatedAt,
        }
      : {
          data: defaultConfigData,
          id: 1,
          updatedAt: input.updatedAt,
        },
    profileRows: input.existingProfileRows,
  };
  const nextState: PersistedSystemConfigState = {
    coreRow: { data: nextConfigData, id: 1, updatedAt: input.updatedAt },
    profileRows: nextProfileRows,
  };

  return {
    nextState,
    previousState,
  } as const;
});
