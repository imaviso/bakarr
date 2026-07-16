import { Effect } from "effect";

import type { MediaSearchResult } from "@packages/shared/index.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";

export const markSearchResultsAlreadyInLibraryEffect = Effect.fn(
  "MediaSearchResults.markSearchResultsAlreadyInLibrary",
)(function* (mediaReadRepository: MediaRepositoryShape, results: readonly MediaSearchResult[]) {
  const ids = [...new Set(results.map((result) => result.id))];

  if (ids.length === 0) {
    return [...results];
  }

  const libraryIds = yield* mediaReadRepository.findExistingMediaIds(ids);

  return results.map((result) => ({
    ...result,
    already_in_library: libraryIds.has(result.id),
  }));
});
