import { Effect } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { PersistedSystemConfigState } from "@/features/system/config-activation.ts";
import {
  effectDecodeStoredConfigRow,
  encodeConfigCore,
  encodeQualityProfileRow,
  type ConfigCore,
} from "@/features/system/config-codec.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";
import { StoredConfigCorruptError } from "@/features/system/errors.ts";

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
  const currentPasswordResult = yield* effectDecodeStoredConfigRow(input.previousConfigRow).pipe(
    Effect.map((config) => ({
      password: config.qbittorrent.password,
      storedConfigCorrupt: false,
    })),
    Effect.catchTag("StoredConfigMissingError", () =>
      Effect.succeed({
        password: makeDefaultConfig(input.appDatabaseFile).qbittorrent.password,
        storedConfigCorrupt: false,
      }),
    ),
    Effect.catchTag("StoredConfigCorruptError", () =>
      Effect.succeed({
        password: null,
        storedConfigCorrupt: true,
      }),
    ),
  );

  if (
    currentPasswordResult.storedConfigCorrupt &&
    input.nextConfig.qbittorrent.enabled &&
    !input.nextConfig.qbittorrent.password?.trim()
  ) {
    return yield* new StoredConfigCorruptError({
      message:
        "Stored configuration is corrupt. Re-enter the qBittorrent password before saving repaired config.",
    });
  }

  return currentPasswordResult.password;
});

export function buildPersistedConfigStates(input: {
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
  const previousState: PersistedSystemConfigState = {
    coreRow: input.previousConfigRow
      ? {
          data: input.previousConfigRow.data,
          id: input.previousConfigRow.id,
          updatedAt: input.previousConfigRow.updatedAt,
        }
      : {
          data: encodeConfigCore(makeDefaultConfig(input.appDatabaseFile)),
          id: 1,
          updatedAt: input.updatedAt,
        },
    profileRows: input.existingProfileRows,
  };
  const nextState: PersistedSystemConfigState = {
    coreRow: { data: encodeConfigCore(input.normalizedCore), id: 1, updatedAt: input.updatedAt },
    profileRows: input.normalizedConfig.profiles.map(encodeQualityProfileRow),
  };

  return {
    nextState,
    previousState,
  } as const;
}
