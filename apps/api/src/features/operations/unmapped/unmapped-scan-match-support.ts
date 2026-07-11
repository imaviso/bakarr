import { Effect } from "effect";

import type { ScannerState } from "@packages/shared/index.ts";
import type { AniListClient } from "@/features/media/metadata/anilist.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/media/query/search-results.ts";
import type { MediaReadRepositoryShape } from "@/features/media/shared/media-read-repository.ts";
import { mergeLocalFolderMatch } from "@/features/operations/unmapped/unmapped-folder-match-support.ts";
import {
  buildUnmappedFolderSearchQueries,
  mergeUnmappedFolderSuggestions,
} from "@/features/operations/unmapped/unmapped-folders.ts";
import { media } from "@/db/schema.ts";

export const matchSingleUnmappedFolder = Effect.fn("UnmappedScanMatch.matchSingleUnmappedFolder")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeRows: ReadonlyArray<typeof media.$inferSelect>;
    folder: ScannerState["folders"][number];
    mediaReadRepository: MediaReadRepositoryShape;
    nowIso: () => Effect.Effect<string>;
  }) {
    const queries = buildUnmappedFolderSearchQueries(input.folder.name);

    const mediaKind = input.folder.media_kind ?? "anime";
    const suggestions = yield* Effect.forEach(
      queries,
      (query) => input.aniList.searchAnimeMetadata(query, mediaKind),
      { concurrency: 1 },
    ).pipe(Effect.map((resultSets) => resultSets.find((results) => results.length > 0) ?? []));

    const withLocal = yield* mergeLocalFolderMatch(
      {
        ...input.folder,
        suggested_matches: suggestions,
      },
      input.animeRows.filter((row) => row.mediaKind === mediaKind),
    );

    const annotatedSuggestions = yield* markSearchResultsAlreadyInLibraryEffect(
      input.mediaReadRepository,
      withLocal.suggested_matches,
    );

    const now = yield* input.nowIso();

    return mergeUnmappedFolderSuggestions(withLocal, annotatedSuggestions, now);
  },
);
