import { and, eq } from "drizzle-orm";
import { Effect, Option } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import { mediaUnits } from "@/db/schema.ts";
import { probeMediaMetadataOrUndefined } from "@/infra/media/probe.ts";
import { buildEpisodeFilenamePlan } from "@/features/operations/library/naming-canonical-support.ts";
import {
  hasMissingLocalMediaNamingFields,
  selectNamingFormat,
} from "@/features/operations/library/naming-format-support.ts";
import { importDownloadedFile } from "@/features/operations/download/download-file-import-support.ts";
import { upsertEpisodeFile } from "@/features/operations/download/download-unit-upsert-support.ts";
import { parseCoveredEpisodesEffect } from "@/features/operations/download/download-coverage.ts";
import { resolveCompletedContentPath } from "@/features/operations/download/download-paths.ts";
import {
  OperationsInfrastructureError,
  OperationsPathError,
} from "@/features/operations/errors.ts";
import { encodeDownloadEventMetadata } from "@/features/operations/repository/download-repository.ts";
import {
  finalizeDownloadImport,
  markDownloadReconciled,
  type DownloadReconciliationContext,
} from "@/features/operations/download/download-reconciliation-shared.ts";

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
        .from(mediaUnits)
        .where(
          and(
            eq(mediaUnits.mediaId, input.row.mediaId),
            eq(mediaUnits.number, input.row.unitNumber),
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
    input.row.unitNumber,
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
        .select({ aired: mediaUnits.aired, title: mediaUnits.title })
        .from(mediaUnits)
        .where(
          and(
            eq(mediaUnits.mediaId, input.row.mediaId),
            eq(mediaUnits.number, input.row.unitNumber),
          ),
        ),
  );
  const initialNamingPlan = buildEpisodeFilenamePlan({
    animeRow: input.animeRow,
    unitNumbers: [input.row.unitNumber],
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
    input.row.unitNumber,
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
  yield* upsertEpisodeFile(input.db, input.row.mediaId, input.row.unitNumber, managedPath).pipe(
    Effect.mapError(mapReconciliationInfrastructureError),
  );
  const singleNow = yield* input.nowIso();
  const storedCoveredEpisodes = yield* parseCoveredEpisodesEffect(input.row.coveredUnits);
  const eventMetadata = yield* encodeDownloadEventMetadata({
    covered_units: storedCoveredEpisodes,
    imported_path: managedPath,
    ...(input.storedSourceMetadata ? { source_metadata: input.storedSourceMetadata } : {}),
  });

  yield* finalizeDownloadImport({
    downloadId: input.row.id,
    fromStatus: input.row.status,
    now: singleNow,
    mediaId: input.row.mediaId,
    eventType: "download.imported",
    eventMessage: `Imported ${input.row.mediaTitle} episode ${input.row.unitNumber}`,
    eventMetadata,
    logEventType: "downloads.reconciled",
    logMessage: `Mapped completed torrent for ${input.row.mediaTitle} episode ${input.row.unitNumber}`,
    db: input.db,
    tryDatabasePromise: input.tryDatabasePromise,
  });
  yield* input.maybeCleanupImportedTorrent(input.runtimeConfig, input.row.infoHash);
  yield* input.eventBus.publish({
    type: "DownloadFinished",
    payload: {
      media_id: brandMediaId(input.row.mediaId),
      imported_path: managedPath,
      source_metadata: input.storedSourceMetadata,
      title: input.row.torrentName,
    },
  });
});
