import { DomainInputError } from "@/features/errors.ts";
import { QualityProfileRepository } from "@/features/system/repository/quality-profile-repository.ts";
import { Effect, Option } from "effect";

/**
 * Shared by RSS-feed and missing-unit background search: load the media's
 * quality profile or fail with a domain input error.
 */
export const requireQualityProfile = Effect.fn("BackgroundSearch.requireQualityProfile")(function* (
  qualityProfileRepository: typeof QualityProfileRepository.Service,
  profileName: string,
) {
  const profileOption = yield* qualityProfileRepository.loadQualityProfile(profileName);

  if (Option.isNone(profileOption)) {
    return yield* new DomainInputError({
      message: `Quality profile '${profileName}' not found`,
    });
  }

  return profileOption.value;
});
