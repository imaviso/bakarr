import { Effect } from "effect";

import type { ScannerState } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/anime/search-results.ts";
import { mergeLocalFolderMatch } from "@/features/operations/unmapped-folder-match-support.ts";
import {
  buildUnmappedFolderSearchQueries,
  mergeUnmappedFolderSuggestions,
} from "@/features/operations/unmapped-folders.ts";
import { anime } from "@/db/schema.ts";

export const matchSingleUnmappedFolder = Effect.fn("OperationsService.matchSingleUnmappedFolder")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeRows: ReadonlyArray<typeof anime.$inferSelect>;
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
