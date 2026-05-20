import { Context, Effect, Layer } from "effect";

import type { Quality, QualityProfile } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { nowIsoFromClock, ClockService } from "@/infra/clock.ts";
import {
  StoredConfigCorruptError,
  ProfileNotFoundError,
  ConfigValidationError,
} from "@/features/system/errors.ts";
import {
  decodeQualityProfileRow,
  encodeQualityProfileRow,
} from "@/features/profiles/profile-codec.ts";
import { DEFAULT_QUALITIES } from "@/features/system/defaults.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";

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

const makeQualityProfileService = Effect.fn("QualityProfileService.make")(function* () {
  const clock = yield* ClockService;
  const qualityProfileRepository = yield* QualityProfileRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const nowIso = () => nowIsoFromClock(clock);

  const listProfiles = Effect.fn("QualityProfileService.listProfiles")(function* () {
    const rows = yield* qualityProfileRepository.listQualityProfileRows();
    return yield* Effect.forEach(rows, decodeQualityProfileRow);
  });

  const listQualities = Effect.fn("QualityProfileService.listQualities")(() =>
    Effect.succeed([...DEFAULT_QUALITIES]),
  );

  const createProfile = Effect.fn("QualityProfileService.createProfile")(function* (
    profile: QualityProfile,
  ) {
    const encodedProfile = yield* encodeQualityProfileRow(profile);

    yield* qualityProfileRepository.insertQualityProfileRow(encodedProfile);
    yield* systemLogRepository.appendLog(
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
    const existing = yield* qualityProfileRepository.loadQualityProfileRow(name);

    if (!existing) {
      return yield* new ProfileNotFoundError({ message: "Quality profile not found" });
    }

    const encodedProfile = yield* encodeQualityProfileRow(profile);

    yield* qualityProfileRepository.renameQualityProfileWithCascade(name, encodedProfile);
    yield* systemLogRepository.appendLog(
      "profiles.updated",
      "success",
      `Quality profile '${name}' updated`,
      nowIso,
    );
    return profile;
  });

  const deleteProfile = Effect.fn("QualityProfileService.deleteProfile")(function* (name: string) {
    const referencingAnime = yield* qualityProfileRepository.countAnimeUsingProfile(name);

    if (referencingAnime > 0) {
      return yield* new ConfigValidationError({
        message: `Cannot delete profile '${name}': still referenced by ${referencingAnime} media`,
      });
    }

    yield* qualityProfileRepository.deleteQualityProfileRow(name);
    yield* systemLogRepository.appendLog(
      "profiles.deleted",
      "success",
      `Quality profile '${name}' deleted`,
      nowIso,
    );
    return undefined;
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
  makeQualityProfileService(),
);
