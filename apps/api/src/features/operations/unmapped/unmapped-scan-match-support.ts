import { Effect } from "effect";

import type { ScannerState } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { AniListClient } from "@/features/media/metadata/anilist.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/media/query/search-results.ts";
import { mergeLocalFolderMatch } from "@/features/operations/unmapped/unmapped-folder-match-support.ts";
import {
  buildUnmappedFolderSearchQueries,
  mergeUnmappedFolderSuggestions,
} from "@/features/operations/unmapped/unmapped-folders.ts";
import { media } from "@/db/schema.ts";

export const matchSingleUnmappedFolder = Effect.fn("OperationsService.matchSingleUnmappedFolder")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeRows: ReadonlyArray<typeof media.$inferSelect>;
    db: AppDatabase;
    folder: ScannerState["folders"][number];
    nowIso: () => Effect.Effect<string>;
  }) {
    const queries = buildUnmappedFolderSearchQueries(input.folder.name);

    const suggestions = yield* Effect.forEach(
      queries,
      (query) => input.aniList.searchAnimeMetadata(query),
      { concurrency: 1 },
    ).pipe(Effect.map((resultSets) => resultSets.find((results) => results.length > 0) ?? []));

    const withLocal = yield* mergeLocalFolderMatch(
      {
        ...input.folder,
        suggested_matches: suggestions,
      },
      input.animeRows,
    );

    const annotatedSuggestions = yield* markSearchResultsAlreadyInLibraryEffect(
      input.db,
      withLocal.suggested_matches,
    );

    const now = yield* input.nowIso();

    return mergeUnmappedFolderSuggestions(withLocal, annotatedSuggestions, now);
  },
);
