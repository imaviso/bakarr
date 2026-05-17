import { Effect, Either } from "effect";
import * as Cron from "effect/Cron";

import type { Config } from "@packages/shared/index.ts";
import type { DatabaseError } from "@/db/database.ts";
import { ConfigValidationError } from "@/features/system/errors.ts";
import { normalizeQBitTorrentConfig } from "@/features/system/qbittorrent-config.ts";

export interface ExistingConfigProfileRow {
  readonly name: string;
}

export const validateConfigUpdate = Effect.fn("ConfigUpdateValidation.validateConfigUpdate")(
  function* (input: {
    readonly existingProfileRows: ReadonlyArray<ExistingConfigProfileRow>;
    readonly countAnimeUsingProfile: (profileName: string) => Effect.Effect<number, DatabaseError>;
    readonly nextConfig: Config;
  }) {
    const cronExpression = input.nextConfig.scheduler.cron_expression?.trim();

    if (input.nextConfig.scheduler.enabled && cronExpression) {
      const parsedCron = Cron.parse(cronExpression);

      if (Either.isLeft(parsedCron)) {
        return yield* new ConfigValidationError({
          message: "Invalid scheduler cron expression",
        });
      }
    }

    yield* normalizeQBitTorrentConfig(input.nextConfig.qbittorrent);

    const keptProfileNames = new Set(input.nextConfig.profiles.map((profile) => profile.name));
    const removedProfileNames = input.existingProfileRows
      .map((row) => row.name)
      .filter((name) => !keptProfileNames.has(name));

    for (const removedProfileName of removedProfileNames) {
      const referencingAnime = yield* input.countAnimeUsingProfile(removedProfileName);

      if (referencingAnime > 0) {
        return yield* new ConfigValidationError({
          message: `Cannot remove profile '${removedProfileName}': still referenced by ${referencingAnime} media`,
        });
      }
    }
    return undefined;
  },
);
