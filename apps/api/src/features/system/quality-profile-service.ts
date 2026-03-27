import { Context, Effect, Layer } from "effect";

import type { Quality, QualityProfile } from "../../../../../packages/shared/src/index.ts";
import { Database, DatabaseError } from "../../db/database.ts";
import { nowIsoFromClock, ClockService } from "../../lib/clock.ts";
import { StoredConfigCorruptError, ProfileNotFoundError, ConfigValidationError } from "./errors.ts";
import { effectDecodeQualityProfileRow, encodeQualityProfileRow } from "./config-codec.ts";
import { appendSystemLog } from "./support.ts";
import { DEFAULT_QUALITIES } from "./defaults.ts";
import {
  countAnimeUsingProfile,
  deleteQualityProfileRow,
  insertQualityProfileRow,
  listQualityProfileRows,
  loadQualityProfileRow,
  renameQualityProfileWithCascade,
} from "./repository/config-repository.ts";

export interface QualityProfileServiceShape {
  readonly listProfiles: () => Effect.Effect<
    QualityProfile[],
    DatabaseError | StoredConfigCorruptError
  >;
  readonly listQualities: () => Effect.Effect<Quality[], never>;
  readonly createProfile: (profile: QualityProfile) => Effect.Effect<QualityProfile, DatabaseError>;
  readonly updateProfile: (
    name: string,
    profile: QualityProfile,
  ) => Effect.Effect<QualityProfile, DatabaseError | ProfileNotFoundError>;
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
    return yield* Effect.forEach(rows, effectDecodeQualityProfileRow);
  });

  const listQualities = Effect.fn("QualityProfileService.listQualities")(function* () {
    return [...DEFAULT_QUALITIES];
  });

  const createProfile = Effect.fn("QualityProfileService.createProfile")(function* (
    profile: QualityProfile,
  ) {
    yield* insertQualityProfileRow(db, encodeQualityProfileRow(profile));
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

    yield* renameQualityProfileWithCascade(db, name, encodeQualityProfileRow(profile));
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
      return yield* new ConfigValidationError({
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
