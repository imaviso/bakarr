import { Effect } from "effect";

import { toMediaDto } from "@/features/media/shared/dto.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";

export const getMediaEffect = Effect.fn("MediaQueryGet.getMediaEffect")(function* (input: {
  id: number;
  mediaRepository: MediaRepositoryShape;
}) {
  const row = yield* input.mediaRepository.getMediaRow(input.id);
  const episodeRows = yield* input.mediaRepository.listUnitRowsByMediaId(input.id);

  return yield* toMediaDto(row, episodeRows);
});
