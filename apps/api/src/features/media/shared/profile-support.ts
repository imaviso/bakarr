import { Effect } from "effect";

import type { QualityProfileRepositoryShape } from "@/features/system/repository/quality-profile-repository.ts";

export const qualityProfileExistsEffect = Effect.fn("MediaProfileSupport.qualityProfileExists")(
  function* (qualityProfileRepository: QualityProfileRepositoryShape, name: string) {
    return yield* qualityProfileRepository.qualityProfileExists(name);
  },
);
