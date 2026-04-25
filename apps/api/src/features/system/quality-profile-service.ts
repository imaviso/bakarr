import { Context, Effect, Layer } from "effect";

import type { Quality, QualityProfile } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import {
  StoredConfigCorruptError,
  ProfileNotFoundError,
  ConfigValidationError,
} from "@/features/system/errors.ts";
import {
  decodeQualityProfileRow,
  encodeQualityProfileRow,
} from "@/features/system/config-codec.ts";
import { appendSystemLog } from "@/features/system/support.ts";
import { DEFAULT_QUALITIES } from "@/features/system/defaults.ts";
import { countAnimeUsingProfile } from "@/features/system/repository/profile-usage-repository.ts";
import {
  deleteQualityProfileRow,
  insertQualityProfileRow,
  listQualityProfileRows,
  loadQualityProfileRow,
  renameQualityProfileWithCascade,
} from "@/features/system/repository/quality-profile-repository.ts";

export interface QualityProfileServiceShape {
  readonly listProfiles: () => Effect.Effect<
    QualityProfile[],
    DatabaseError | StoredConfigCorruptError
  >;
  readonly listQualities: () => Effect.Effect<Quality[]>;
  readonly createProfile: (
    profile: QualityProfile,
  ) => Effect.Effect<QualityProfile, DatabaseError | StoredConfigCorruptError>;
  readonly updateProfile: (
    name: string,
    profile: QualityProfile,
  ) => Effect.Effect<
    QualityProfile,
    DatabaseError | ProfileNotFoundError | StoredConfigCorruptError
  >;
  readonly deleteProfile: (
    name: string,
  ) => Effect.Effect<void, DatabaseError | ConfigValidationError>;
}

export class QualityProfileService extends Context.Tag("@bakarr/api/QualityProfileService")<
  QualityProfileService,
  QualityProfileServiceShape
>() {}

const makeQualityProfileService = Effect.gen(function* () {
  const { db } = yield* Database;
  const clock = yield* ClockService;
  const nowIso = () => nowIsoFromClock(clock);

  const listProfiles = Effect.fn("QualityProfileService.listProfiles")(function* () {
    const rows = yield* listQualityProfileRows(db);
    return yield* Effect.forEach(rows, decodeQualityProfileRow);
  });

  const listQualities = Effect.fn("QualityProfileService.listQualities")(() =>
    Effect.succeed([...DEFAULT_QUALITIES]),
  );

  const createProfile = Effect.fn("QualityProfileService.createProfile")(function* (
    profile: QualityProfile,
  ) {
    const encodedProfile = yield* encodeQualityProfileRow(profile);

    yield* insertQualityProfileRow(db, encodedProfile);
    yield* appendSystemLog(
      db,
      "profiles.created",
      "success",
      `Quality profile '${profile.name}' created`,
      nowIso,
    );
    return profile;
  });

  const updateProfile = Effect.fn("QualityProfileService.updateProfile")(function* (
    name: string,
    profile: QualityProfile,
  ) {
    const existing = yield* loadQualityProfileRow(db, name);

    if (!existing) {
      return yield* new ProfileNotFoundError({ message: "Quality profile not found" });
    }

    const encodedProfile = yield* encodeQualityProfileRow(profile);

    yield* renameQualityProfileWithCascade(db, name, encodedProfile);
    yield* appendSystemLog(
      db,
      "profiles.updated",
      "success",
      `Quality profile '${name}' updated`,
      nowIso,
    );
    return profile;
  });

  const deleteProfile = Effect.fn("QualityProfileService.deleteProfile")(function* (name: string) {
    const referencingAnime = yield* countAnimeUsingProfile(db, name);

    if (referencingAnime > 0) {
      yield* new ConfigValidationError({
        message: `Cannot delete profile '${name}': still referenced by ${referencingAnime} anime`,
      });
    }

    yield* deleteQualityProfileRow(db, name);
    yield* appendSystemLog(
      db,
      "profiles.deleted",
      "success",
      `Quality profile '${name}' deleted`,
      nowIso,
    );
  });

  return {
    listProfiles,
    listQualities,
    createProfile,
    updateProfile,
    deleteProfile,
  } satisfies QualityProfileServiceShape;
});

export const QualityProfileServiceLive = Layer.effect(
  QualityProfileService,
  makeQualityProfileService,
);
