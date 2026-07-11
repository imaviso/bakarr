import { Effect } from "effect";

import type { QualityProfile } from "@packages/shared/index.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { ConfigValidationError, SystemNotFoundError } from "@/features/system/errors.ts";
import {
  decodeQualityProfileRow,
  encodeQualityProfileRow,
} from "@/features/system/profile-codec.ts";
import { DEFAULT_QUALITIES } from "@/features/system/defaults.ts";
import { SystemLogRepository } from "@/features/system/repository/log-repository.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";

const makeQualityProfileService = Effect.fn("QualityProfileService.make")(function* () {
  const qualityProfileRepository = yield* QualityProfileRepository;
  const systemLogRepository = yield* SystemLogRepository;
  const nowIso = currentNowIso;

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
      return yield* new SystemNotFoundError({ message: "Quality profile not found" });
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
    const referencingAnime = yield* qualityProfileRepository.countMediaUsingProfile(name);

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
  };
});

export class QualityProfileService extends Effect.Service<QualityProfileService>()(
  "@bakarr/api/QualityProfileService",
  {
    effect: makeQualityProfileService(),
  },
) {}

export const QualityProfileServiceLive = QualityProfileService.Default;
