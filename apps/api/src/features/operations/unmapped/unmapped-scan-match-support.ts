import type { ScannerState } from "@packages/shared/index.ts";
import type { AniListClient } from "@/features/media/metadata/anilist.ts";
import type { ExternalIdMapRepository } from "@/features/media/metadata/external-id-map-repository.ts";
import type { TenraiClient } from "@/features/media/metadata/tenrai.ts";
import { searchMediaWithFallback } from "@/features/media/metadata/media-metadata-provider-service.ts";
import { markSearchResultsAlreadyInLibraryEffect } from "@/features/media/query/search-results.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import { mergeLocalFolderMatch } from "@/features/operations/unmapped/unmapped-folder-match-support.ts";
import {
  buildUnmappedFolderSearchQueries,
  mergeUnmappedFolderSuggestions,
} from "@/features/operations/unmapped/unmapped-folders.ts";
import { media } from "@/db/schema.ts";
import { Effect } from "effect";

export const matchSingleUnmappedFolder = Effect.fn("UnmappedScanMatch.matchSingleUnmappedFolder")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeRows: ReadonlyArray<typeof media.$inferSelect>;
    folder: ScannerState["folders"][number];
    idMap: typeof ExternalIdMapRepository.Service;
    mediaRepository: MediaRepositoryShape;
    nowIso: () => Effect.Effect<string>;
    tenrai: typeof TenraiClient.Service;
  }) {
    const queries = buildUnmappedFolderSearchQueries(input.folder.name);

    const mediaKind = input.folder.media_kind ?? "anime";
    // Tenrai fallback keeps auto-matching alive during AniList outages;
    // degraded results carry their MAL space and stay addable.
    const suggestions = yield* Effect.forEach(
      queries,
      (query) =>
        searchMediaWithFallback({
          aniList: input.aniList,
          mediaKind,
          query,
          tenrai: input.tenrai,
        }).pipe(
          Effect.tap((result) =>
            result.degraded
              ? Effect.logWarning("Unmapped matching on Tenrai fallback").pipe(
                  Effect.annotateLogs({ query }),
                )
              : Effect.void,
          ),
          Effect.map((result) => result.results),
        ),
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
      input.mediaRepository,
      input.idMap,
      withLocal.suggested_matches,
    );

    const now = yield* input.nowIso();

    return mergeUnmappedFolderSuggestions(withLocal, annotatedSuggestions, now);
  },
);
