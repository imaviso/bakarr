import { Effect } from "effect";

import { toMediaDto } from "@/features/media/shared/dto.ts";
import type { MediaReadRepositoryShape } from "@/features/media/shared/media-read-repository.ts";

export const getMediaEffect = Effect.fn("MediaQueryGet.getMediaEffect")(function* (input: {
  id: number;
  mediaReadRepository: MediaReadRepositoryShape;
}) {
  const row = yield* input.mediaReadRepository.getMediaRow(input.id);
  const episodeRows = yield* input.mediaReadRepository.listUnitRowsByMediaId(input.id);

  return yield* toMediaDto(row, episodeRows);
});
