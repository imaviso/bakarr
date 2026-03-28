import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import { episodes } from "../../db/schema.ts";
import {
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "./naming-support.ts";
import { importDownloadedFile, upsertEpisodeFile } from "./download-support.ts";
import { parseCoveredEpisodesEffect, resolveCompletedContentPath } from "./download-lifecycle.ts";
import { OperationsPathError } from "./errors.ts";
import { encodeDownloadEventMetadata } from "./repository.ts";
import {
  finalizeDownloadImport,
  markDownloadReconciled,
  type DownloadReconciliationContext,
} from "./download-reconciliation-shared.ts";

export const reconcileSingleDownloadEffect = Effect.fn(
  "OperationsService.reconcileCompletedTorrentSingle",
)(function* (input: DownloadReconciliationContext) {
  if (!input.row.contentPath && !input.row.savePath) {
    return;
  }

  if (input.row.reconciledAt) {
    return;
  }

  const existingEpisode = yield* input.tryDatabasePromise(
    "Failed to reconcile completed download",
    () =>
      input.db
        .select()
        .from(episodes)
        .where(
          and(
            eq(episodes.animeId, input.row.animeId),
            eq(episodes.number, input.row.episodeNumber),
          ),
        )
        .limit(1),
  );

  if (existingEpisode[0]?.downloaded && existingEpisode[0]?.filePath) {
    const alreadyImportedNow = yield* input.nowIso();
    yield* markDownloadReconciled({
      db: input.db,
      downloadId: input.row.id,
      now: alreadyImportedNow,
      tryDatabasePromise: input.tryDatabasePromise,
    });
    return;
  }

  const expectedAirDate =
    existingEpisode[0]?.aired ??
    input.storedSourceMetadata?.air_date ??
    (input.storedSourceMetadata?.source_identity?.scheme === "daily"
      ? input.storedSourceMetadata.source_identity.air_dates?.[0]
      : undefined);

  const resolvedPath = yield* resolveCompletedContentPath(
    input.fs,
    input.resolvedContentRoot,
    input.row.episodeNumber,
    { expectedAirDate },
  ).pipe(
    Effect.mapError(
      () =>
        new OperationsPathError({
          message: `Download content path is inaccessible: ${input.resolvedContentRoot}`,
        }),
    ),
  );

  if (!resolvedPath) {
    return;
  }

  const namingFormat = selectNamingFormat(input.animeRow, {
    movieNamingFormat: input.runtimeConfig.library.movie_naming_format,
    namingFormat: input.runtimeConfig.library.naming_format,
  });
  const episodeRows = yield* input.tryDatabasePromise(
    "Failed to reconcile completed download",
    () =>
      input.db
        .select({ aired: episodes.aired, title: episodes.title })
        .from(episodes)
        .where(
          and(
            eq(episodes.animeId, input.row.animeId),
            eq(episodes.number, input.row.episodeNumber),
          ),
        ),
  );
  const initialNamingPlan = buildEpisodeFilenamePlan({
    animeRow: input.animeRow,
    downloadSourceMetadata: input.storedSourceMetadata,
    episodeNumbers: [input.row.episodeNumber],
    episodeRows,
    filePath: resolvedPath,
    namingFormat,
    preferredTitle: input.runtimeConfig.library.preferred_title,
  });
  const localMediaMetadata = hasMissingLocalMediaNamingFields(initialNamingPlan.missingFields)
    ? yield* input.mediaProbe
        .probeVideoFile(resolvedPath)
        .pipe(
          Effect.map((probeResult) =>
            probeResult._tag === "MediaProbeMetadataFound" ? probeResult.metadata : undefined,
          ),
        )
    : undefined;

  const managedPath = yield* importDownloadedFile(
    input.fs,
    input.animeRow,
    input.row.episodeNumber,
    resolvedPath,
    input.importMode,
    {
      downloadSourceMetadata: input.storedSourceMetadata,
      episodeRows,
      localMediaMetadata,
      namingFormat,
      preferredTitle: input.runtimeConfig.library.preferred_title,
      randomUuid: input.randomUuid,
    },
  ).pipe(Effect.mapError(input.wrapOperationsError("Failed to reconcile completed download")));
  yield* upsertEpisodeFile(input.db, input.row.animeId, input.row.episodeNumber, managedPath).pipe(
    Effect.mapError(input.wrapOperationsError("Failed to reconcile completed download")),
  );
  const singleNow = yield* input.nowIso();
  const storedCoveredEpisodes = yield* parseCoveredEpisodesEffect(input.row.coveredEpisodes);
  yield* finalizeDownloadImport({
    downloadId: input.row.id,
    fromStatus: input.row.status,
    now: singleNow,
    animeId: input.row.animeId,
    eventType: "download.imported",
    eventMessage: `Imported ${input.row.animeTitle} episode ${input.row.episodeNumber}`,
    eventMetadata: encodeDownloadEventMetadata({
      covered_episodes: storedCoveredEpisodes,
      imported_path: managedPath,
      source_metadata: input.storedSourceMetadata,
    }),
    logEventType: "downloads.reconciled",
    logMessage: `Mapped completed torrent for ${input.row.animeTitle} episode ${input.row.episodeNumber}`,
    db: input.db,
    tryDatabasePromise: input.tryDatabasePromise,
  });
  yield* input.maybeCleanupImportedTorrent(input.runtimeConfig, input.row.infoHash);
  yield* input.eventBus.publish({
    type: "DownloadFinished",
    payload: {
      anime_id: input.row.animeId,
      imported_path: managedPath,
      source_metadata: input.storedSourceMetadata,
      title: input.row.torrentName,
    },
  });
});
