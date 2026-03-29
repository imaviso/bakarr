import { inArray } from "drizzle-orm";
import { Effect } from "effect";

import type { AnimeSearchResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";

export const markSearchResultsAlreadyInLibraryEffect = Effect.fn(
  "AnimeSearchResults.markSearchResultsAlreadyInLibrary",
)(function* (db: AppDatabase, results: readonly AnimeSearchResult[]) {
  const ids = [...new Set(results.map((result) => result.id))];

  if (ids.length === 0) {
    return [...results];
  }

  const rows = yield* tryDatabasePromise("Failed to mark search results in library", () =>
    db.select({ id: anime.id }).from(anime).where(inArray(anime.id, ids)),
  );
  const libraryIds = new Set(rows.map((row) => row.id));

  return results.map((result) => ({
    ...result,
    already_in_library: libraryIds.has(result.id),
  }));
});
