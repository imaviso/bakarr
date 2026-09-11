import type { MediaSearchResult } from "@packages/shared/index.ts";
import type { ExternalIdMapRepository } from "@/features/media/metadata/external-id-map-repository.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import { Effect } from "effect";

type IdMapReader = Pick<typeof ExternalIdMapRepository.Service, "loadByEitherIds">;

interface IdBridge {
  readonly anilistId?: number | undefined;
  readonly malId?: number | undefined;
}

export const markSearchResultsAlreadyInLibraryEffect = Effect.fn(
  "MediaSearchResults.markSearchResultsAlreadyInLibrary",
)(function* (
  mediaRepository: MediaRepositoryShape,
  idMap: IdMapReader,
  results: readonly MediaSearchResult[],
) {
  if (results.length === 0) {
    return [...results];
  }

  // One batched map read for the whole page. A result only ever matches rows
  // in its own space (plus bridged counterparts): the shared number range
  // makes bare id-or-malId matching mark unrelated shows. A broken map
  // degrades to direct matching so discovery rendering never fails.
  const ids = [...new Set(results.map((result) => result.id))];
  const rows = yield* idMap
    .loadByEitherIds(ids)
    .pipe(
      Effect.catch((error) =>
        Effect.logWarning("External id map batch lookup degraded").pipe(
          Effect.annotateLogs({ error: error.message, resultCount: results.length }),
          Effect.as([]),
        ),
      ),
    );

  const anilistIds = [
    ...new Set([
      ...results.flatMap((result) => (result.id_space === "mal" ? [] : [result.id])),
      ...rows.map((row) => row.anilistId),
    ]),
  ];
  const malIds = [
    ...new Set([
      ...results.flatMap((result) => (result.id_space === "anilist" ? [] : [result.id])),
      ...rows.flatMap((row) => (row.malId === undefined ? [] : [row.malId])),
    ]),
  ];

  const [byId, byMal] = yield* Effect.all([
    mediaRepository.findExistingMediaIds(anilistIds),
    mediaRepository.findExistingMediaMalIds(malIds),
  ]);

  return results.map((result) => ({
    ...result,
    already_in_library: isResultInLibrary(result, rows, byId, byMal),
  }));
});

function isResultInLibrary(
  result: MediaSearchResult,
  rows: ReadonlyArray<{
    readonly anilistId: number;
    readonly malId?: number | undefined;
  }>,
  byId: ReadonlySet<number>,
  byMal: ReadonlySet<number>,
): boolean {
  const bridge = bridgeResultId(rows, result.id);

  if (result.id_space === "mal") {
    return byMal.has(result.id) || (bridge?.anilistId !== undefined && byId.has(bridge.anilistId));
  }

  if (result.id_space === "anilist") {
    return byId.has(result.id) || (bridge?.malId !== undefined && byMal.has(bridge.malId));
  }

  return (
    byId.has(result.id) ||
    byMal.has(result.id) ||
    (bridge?.anilistId !== undefined && byId.has(bridge.anilistId)) ||
    (bridge?.malId !== undefined && byMal.has(bridge.malId))
  );
}

// Projects one requested id to its counterpart from the batch rows. Prefers
// the AniList-side row on cross-row numeric collisions, mirroring
// loadByEitherId.
function bridgeResultId(
  rows: ReadonlyArray<{
    readonly anilistId: number;
    readonly malId?: number | undefined;
  }>,
  id: number,
): IdBridge | undefined {
  const anilistSide = rows.find((row) => row.anilistId === id);

  if (anilistSide !== undefined) {
    return anilistSide.malId === undefined ? undefined : { malId: anilistSide.malId };
  }

  const malSide = rows.find((row) => row.malId === id);

  if (malSide !== undefined) {
    return { anilistId: malSide.anilistId };
  }

  return undefined;
}
