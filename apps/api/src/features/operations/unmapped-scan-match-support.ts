import { Effect } from "effect";

import type { ScannerState } from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "../../lib/anime-search-results.ts";
import { mergeLocalFolderMatch } from "./unmapped-folder-match-support.ts";
import {
  buildUnmappedFolderSearchQueries,
  mergeUnmappedFolderSuggestions,
} from "./unmapped-folders.ts";

export const matchSingleUnmappedFolder = Effect.fn("OperationsService.matchSingleUnmappedFolder")(
  function* (input: {
    aniList: typeof import("../anime/anilist.ts").AniListClient.Service;
    animeRows: ReadonlyArray<typeof import("../../db/schema.ts").anime.$inferSelect>;
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
