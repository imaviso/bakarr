import { Context, Effect, Layer } from "effect";

import type { DownloadAction } from "@packages/shared/index.ts";
import { Database, DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "@/features/operations/library/naming-metadata-support.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
} from "@/features/operations/download/download-coverage.ts";
import { parseReleaseName } from "@/features/operations/search/release-ranking.ts";
import { parseVolumeNumbersFromTitle } from "@/features/operations/search/release-volume.ts";
import { queueParsedReleaseDownload } from "@/features/operations/search/release-queue-support.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { TorrentClientService } from "@/features/operations/qbittorrent/torrent-client-service.ts";
import { DownloadTriggerCoordinator } from "@/features/operations/tasks/runtime-support.ts";
import { ClockService, nowIsoFromClock } from "@/infra/clock.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";

export interface BackgroundSearchQueueServiceShape {
  readonly queueReleaseIfEligible: (input: {
    animeRow: typeof media.$inferSelect;
    contextMessage: string;
    decisionReason?: string;
    action?: DownloadAction;
    unitNumber: number;
    eventMessage: string;
    eventType: string;
    item: ParsedRelease;
    missingUnits: readonly number[];
  }) => Effect.Effect<
    { readonly _tag: "skipped" } | { readonly _tag: "queued" },
    DatabaseError | OperationsInfrastructureError
  >;
}

export class BackgroundSearchQueueService extends Context.Tag(
  "@bakarr/api/BackgroundSearchQueueService",
)<BackgroundSearchQueueService, BackgroundSearchQueueServiceShape>() {}

export const BackgroundSearchQueueServiceLive = Layer.effect(
  BackgroundSearchQueueService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const clock = yield* ClockService;
    const torrentClientService = yield* TorrentClientService;
    const downloadTriggerCoordinator = yield* DownloadTriggerCoordinator;

    const nowIso = () => nowIsoFromClock(clock);

    const queueReleaseIfEligible = Effect.fn("BackgroundSearchQueueService.queueReleaseIfEligible")(
      function* (input: {
        animeRow: typeof media.$inferSelect;
        contextMessage: string;
        decisionReason?: string;
        action?: DownloadAction;
        unitNumber: number;
        eventMessage: string;
        eventType: string;
        item: ParsedRelease;
        missingUnits: readonly number[];
      }) {
        const parsedRelease = parseReleaseName(input.item.title);
        const explicitUnitNumbers =
          input.animeRow.mediaKind === "anime"
            ? parsedRelease.unitNumbers
            : parseVolumeNumbersFromTitle(input.item.title);

        const coveredUnits = yield* toCoveredEpisodesJson(
          inferCoveredEpisodeNumbers({
            explicitEpisodes: explicitUnitNumbers,
            isBatch: parsedRelease.isBatch || explicitUnitNumbers.length > 1,
            totalUnits: input.animeRow.unitCount,
            missingUnits: input.missingUnits,
            requestedEpisode: input.unitNumber,
          }),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new OperationsInfrastructureError({
                message: "Failed to queue background release",
                cause,
              }),
          ),
        );

        const queueEffect = Effect.gen(function* () {
          const parsedCoveredEpisodes = yield* parseCoveredEpisodesEffect(coveredUnits);
          const overlapping = yield* hasOverlappingDownload(
            db,
            input.animeRow.id,
            input.item.infoHash,
            parsedCoveredEpisodes,
          );

          if (overlapping) {
            return { _tag: "skipped" } as const;
          }

          yield* queueParsedReleaseDownload({
            animeRow: input.animeRow,
            contextMessage: input.contextMessage,
            coveredUnits,
            db,
            unitNumber: input.unitNumber,
            eventMessage: input.eventMessage,
            eventType: input.eventType,
            isBatch: parsedRelease.isBatch,
            item: input.item,
            nowIso,
            sourceMetadata: mergeDownloadSourceMetadata(
              buildDownloadSourceMetadataFromRelease({
                ...buildDownloadSelectionMetadata(input.action),
                ...(input.decisionReason === undefined
                  ? {}
                  : { decisionReason: input.decisionReason }),
                ...(input.item.group === undefined ? {} : { group: input.item.group }),
                indexer: "Nyaa",
                isSeadex: input.item.isSeaDex,
                isSeadexBest: input.item.isSeaDexBest,
                remake: input.item.remake,
                ...(input.item.seaDexComparison === undefined
                  ? {}
                  : { seadexComparison: input.item.seaDexComparison }),
                ...(input.item.seaDexDualAudio === undefined
                  ? {}
                  : { seadexDualAudio: input.item.seaDexDualAudio }),
                ...(input.item.seaDexNotes === undefined
                  ? {}
                  : { seadexNotes: input.item.seaDexNotes }),
                ...(input.item.seaDexReleaseGroup === undefined
                  ? {}
                  : { seadexReleaseGroup: input.item.seaDexReleaseGroup }),
                ...(input.item.seaDexTags === undefined
                  ? {}
                  : { seadexTags: input.item.seaDexTags }),
                ...(input.item.viewUrl === undefined ? {} : { sourceUrl: input.item.viewUrl }),
                title: input.item.title,
                trusted: input.item.trusted,
              }),
            ),
            torrentClientService,
            tryDatabasePromise,
          }).pipe(
            Effect.mapError((cause) =>
              cause instanceof DatabaseError || cause instanceof OperationsInfrastructureError
                ? cause
                : new OperationsInfrastructureError({
                    message: "Failed to queue background release",
                    cause,
                  }),
            ),
          );

          return { _tag: "queued" } as const;
        });

        return yield* downloadTriggerCoordinator.runExclusiveDownloadTrigger(queueEffect).pipe(
          Effect.mapError(
            (cause) =>
              new OperationsInfrastructureError({
                message: "Failed to queue background release",
                cause,
              }),
          ),
        );
      },
    );

    return BackgroundSearchQueueService.of({
      queueReleaseIfEligible,
    });
  }),
);
