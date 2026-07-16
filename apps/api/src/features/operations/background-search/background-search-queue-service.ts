import { Effect } from "effect";

import type { DownloadAction } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
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
import { DownloadRepository } from "@/features/operations/repository/download-repository-service.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { InfrastructureError } from "@/features/errors.ts";

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
    DatabaseError | InfrastructureError
  >;
}

export class BackgroundSearchQueueService extends Effect.Service<BackgroundSearchQueueService>()(
  "@bakarr/api/BackgroundSearchQueueService",
  {
    effect: Effect.gen(function* () {
      const downloadRepository = yield* DownloadRepository;
      const torrentClientService = yield* TorrentClientService;
      const downloadTriggerCoordinator = yield* DownloadTriggerCoordinator;
      const nowIso = currentNowIso;

      const queueReleaseIfEligible = Effect.fn(
        "BackgroundSearchQueueService.queueReleaseIfEligible",
      )(function* (input: {
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
        const isBatch =
          input.animeRow.mediaKind === "anime"
            ? parsedRelease.isBatch
            : explicitUnitNumbers.length > 1;

        const coveredUnits = yield* toCoveredEpisodesJson(
          inferCoveredEpisodeNumbers({
            explicitEpisodes: explicitUnitNumbers,
            isBatch,
            totalUnits: input.animeRow.unitCount,
            missingUnits: input.missingUnits,
            requestedEpisode: input.unitNumber,
          }),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new InfrastructureError({
                message: "Failed to queue background release",
                cause,
              }),
          ),
        );

        const queueEffect = Effect.gen(function* () {
          const parsedCoveredEpisodes = yield* parseCoveredEpisodesEffect(coveredUnits);
          const overlapping = yield* hasOverlappingDownload(
            downloadRepository,
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
            downloadRepository,
            unitNumber: input.unitNumber,
            eventMessage: input.eventMessage,
            eventType: input.eventType,
            isBatch,
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
          }).pipe(
            Effect.mapError((cause) =>
              cause instanceof DatabaseError || cause instanceof InfrastructureError
                ? cause
                : new InfrastructureError({
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
              new InfrastructureError({
                message: "Failed to queue background release",
                cause,
              }),
          ),
        );
      });

      return {
        queueReleaseIfEligible,
      } satisfies BackgroundSearchQueueServiceShape;
    }),
    dependencies: [DownloadRepository.Default, DownloadTriggerCoordinator.Default],
  },
) {}

export const BackgroundSearchQueueServiceLive = BackgroundSearchQueueService.Default;
