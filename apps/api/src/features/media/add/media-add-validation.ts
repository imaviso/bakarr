import { Effect, Option } from "effect";

import { MediaConflictError, MediaNotFoundError } from "@/features/media/errors.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import type { QualityProfileRepositoryShape } from "@/features/system/repository/quality-profile-repository.ts";

export const checkMediaExistsEffect = Effect.fn("MediaAddValidation.checkMediaExists")(function* (
  mediaReadRepository: MediaRepositoryShape,
  mediaId: number,
) {
  const exists = yield* mediaReadRepository.mediaExists(mediaId);

  if (exists) {
    return yield* new MediaConflictError({
      message: "Media already exists",
    });
  }

  return undefined;
});

export const requireMediaMetadataEffect = <T>(
  metadata: Option.Option<T>,
): Effect.Effect<T, MediaNotFoundError> => {
  if (Option.isNone(metadata)) {
    return Effect.fail(new MediaNotFoundError({ message: "Media not found" }));
  }
  return Effect.succeed(metadata.value);
};

export const checkProfileExistsEffect = Effect.fn("MediaAddValidation.checkProfileExists")(
  function* (qualityProfileRepository: QualityProfileRepositoryShape, profileName: string) {
    const profileExists = yield* qualityProfileRepository.qualityProfileExists(profileName);

    if (!profileExists) {
      return yield* new MediaNotFoundError({
        message: `Quality profile '${profileName}' not found`,
      });
    }

    return undefined;
  },
);

export const checkRootFolderNotOwnedEffect = Effect.fn(
  "MediaAddValidation.checkRootFolderNotOwned",
)(function* (mediaReadRepository: MediaRepositoryShape, rootFolder: string) {
  const existingRootOwner = yield* mediaReadRepository.findMediaRootFolderOwner(rootFolder);

  if (existingRootOwner) {
    return yield* new MediaConflictError({
      message: `Folder is already mapped to ${existingRootOwner.titleRomaji}`,
    });
  }

  return undefined;
});

export const fetchPersistedEpisodeRowsEffect = Effect.fn(
  "MediaAddValidation.fetchPersistedEpisodeRows",
)(function* (mediaReadRepository: MediaRepositoryShape, mediaId: number) {
  return yield* mediaReadRepository.listUnitRowsByMediaId(mediaId);
});
