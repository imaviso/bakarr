import { Effect } from "effect";

import type { Config } from "@packages/shared/index.ts";
import type { PersistedSystemConfigState } from "@/features/system/config-activation.ts";
import { encodeConfigCore, type ConfigCore } from "@/features/system/config-codec.ts";
import { encodeQualityProfileRow } from "@/features/profiles/profile-codec.ts";
import { makeDefaultConfig } from "@/features/system/defaults.ts";

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
