import { Context, Effect, Layer } from "effect";

import type { QualityProfile } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { OperationsInputError } from "@/features/operations/errors.ts";
import { loadQualityProfile } from "@/features/operations/repository/profile-repository.ts";

export interface BackgroundSearchQualityProfileServiceShape {
  readonly requireQualityProfile: (
    profileName: string,
  ) => Effect.Effect<QualityProfile, DatabaseError | OperationsInputError>;
}

export class BackgroundSearchQualityProfileService extends Context.Tag(
  "@bakarr/api/BackgroundSearchQualityProfileService",
)<BackgroundSearchQualityProfileService, BackgroundSearchQualityProfileServiceShape>() {}

export const BackgroundSearchQualityProfileServiceLive = Layer.effect(
  BackgroundSearchQualityProfileService,
  Effect.gen(function* () {
    const { db } = yield* Database;

    const requireQualityProfile = Effect.fn(
      "BackgroundSearchQualityProfileService.requireQualityProfile",
    )(function* (profileName: string) {
      const profile = yield* loadQualityProfile(db, profileName);

      if (!profile) {
        return yield* new OperationsInputError({
          message: `Quality profile '${profileName}' not found`,
        });
      }

      return profile;
    });

    return BackgroundSearchQualityProfileService.of({ requireQualityProfile });
  }),
);
