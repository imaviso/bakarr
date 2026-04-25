import { and, eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import { episodes } from "@/db/schema.ts";
import { probeMediaMetadataOrUndefined } from "@/infra/media/probe.ts";
import {
  buildEpisodeFilenamePlan,
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "@/features/operations/naming-support.ts";
import { importDownloadedFile, upsertEpisodeFile } from "@/features/operations/download-support.ts";
import { parseCoveredEpisodesEffect } from "@/features/operations/download-coverage.ts";
import { resolveCompletedContentPath } from "@/features/operations/download-paths.ts";
import {
  OperationsInfrastructureError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import { encodeDownloadEventMetadata } from "@/features/operations/repository/download-repository.ts";
import {
  finalizeDownloadImport,
  markDownloadReconciled,
  type DownloadReconciliationContext,
} from "@/features/operations/download-reconciliation-shared.ts";

const mapReconciliationInfrastructureError = (cause: unknown) =>
  new OperationsInfrastructureError({
    cause,
    message: "Failed to reconcile completed download",
  });

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
    expectedAirDate ? { expectedAirDate } : undefined,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new OperationsPathError({
          cause,
          message: `Download content path is inaccessible: ${input.resolvedContentRoot}`,
        }),
    ),
  );

  if (Option.isNone(resolvedPath)) {
    return;
  }
  const resolvedPathValue = resolvedPath.value;

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
    episodeNumbers: [input.row.episodeNumber],
    episodeRows,
    filePath: resolvedPathValue,
    namingFormat,
    preferredTitle: input.runtimeConfig.library.preferred_title,
    ...(input.storedSourceMetadata ? { downloadSourceMetadata: input.storedSourceMetadata } : {}),
  });
  const localMediaMetadata = hasMissingLocalMediaNamingFields(initialNamingPlan.missingFields)
    ? yield* probeMediaMetadataOrUndefined(input.mediaProbe, resolvedPathValue)
    : undefined;

  const managedPath = yield* importDownloadedFile(
    input.fs,
    input.animeRow,
    input.row.episodeNumber,
    resolvedPathValue,
    input.runtimeConfig.library.import_mode,
    {
      episodeRows,
      namingFormat,
      preferredTitle: input.runtimeConfig.library.preferred_title,
      randomUuid: input.randomUuid,
      ...(input.storedSourceMetadata ? { downloadSourceMetadata: input.storedSourceMetadata } : {}),
      ...(localMediaMetadata ? { localMediaMetadata } : {}),
    },
  ).pipe(Effect.mapError(mapReconciliationInfrastructureError));
  yield* upsertEpisodeFile(input.db, input.row.animeId, input.row.episodeNumber, managedPath).pipe(
    Effect.mapError(mapReconciliationInfrastructureError),
  );
  const singleNow = yield* input.nowIso();
  const storedCoveredEpisodes = yield* parseCoveredEpisodesEffect(input.row.coveredEpisodes);
  const eventMetadata = yield* encodeDownloadEventMetadata({
    covered_episodes: storedCoveredEpisodes,
    imported_path: managedPath,
    ...(input.storedSourceMetadata ? { source_metadata: input.storedSourceMetadata } : {}),
  });

  yield* finalizeDownloadImport({
    downloadId: input.row.id,
    fromStatus: input.row.status,
    now: singleNow,
    animeId: input.row.animeId,
    eventType: "download.imported",
    eventMessage: `Imported ${input.row.animeTitle} episode ${input.row.episodeNumber}`,
    eventMetadata,
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
