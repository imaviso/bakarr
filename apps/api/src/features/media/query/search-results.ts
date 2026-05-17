import { inArray } from "drizzle-orm";
import { Effect } from "effect";

import type { MediaSearchResult } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export const markSearchResultsAlreadyInLibraryEffect = Effect.fn(
  "AnimeSearchResults.markSearchResultsAlreadyInLibrary",
)(function* (db: AppDatabase, results: readonly MediaSearchResult[]) {
  const ids = [...new Set(results.map((result) => result.id))];

  if (ids.length === 0) {
    return [...results];
  }

  const rows = yield* tryDatabasePromise("Failed to mark search results in library", () =>
    db.select({ id: media.id }).from(media).where(inArray(media.id, ids)),
  );
  const libraryIds = new Set(rows.map((row) => row.id));

  return results.map((result) => ({
    ...result,
    already_in_library: libraryIds.has(result.id),
  }));
});
