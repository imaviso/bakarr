import type { DownloadAction } from "@packages/shared/index.ts";
import { DatabaseError } from "@/db/database.ts";
import { media } from "@/db/schema.ts";
import {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "@/features/operations/library/naming-source-metadata-support.ts";
import {
  resolveDownloadCoveragePlan,
  queueDownload,
} from "@/features/operations/download/download-queue-support.ts";
import { toCoveredUnitsJson } from "@/features/operations/download/download-coverage.ts";
import type { ParsedRelease } from "@/features/operations/rss/rss-client-parse.ts";
import { TorrentClientService } from "@/features/operations/torrent/torrent-client-service.ts";
import { DownloadTriggerGate } from "@/features/operations/tasks/task-coordinators.ts";
import { DownloadRepository } from "@/features/operations/repository/download-repository.ts";
import { nowIso as currentNowIso } from "@/infra/time.ts";
import { InfrastructureError } from "@/features/errors.ts";
import { Context, Effect, Layer } from "effect";

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

export class BackgroundSearchQueueService extends Context.Service<
  BackgroundSearchQueueService,
  BackgroundSearchQueueServiceShape
>()("@bakarr/api/BackgroundSearchQueueService") {
  static readonly layer = Layer.effect(
    BackgroundSearchQueueService,
    Effect.gen(function* () {
      const downloadRepository = yield* DownloadRepository;
      const torrentClientService = yield* TorrentClientService;
      const downloadTriggerGate = yield* DownloadTriggerGate;
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
        const coveragePlan = resolveDownloadCoveragePlan({
          explicitUnitNumber: input.unitNumber,
          mediaKind: input.animeRow.mediaKind,
          missingUnits: input.missingUnits,
          title: input.item.title,
          totalUnits: input.animeRow.unitCount,
        });

        const coveredUnits = yield* toCoveredUnitsJson(coveragePlan.inferredCoveredEpisodes).pipe(
          Effect.mapError(
            (cause) =>
              new InfrastructureError({
                message: "Failed to queue background release",
                cause,
              }),
          ),
        );

        const queueEffect = queueDownload({
          downloadRepository,
          torrentClientService,
          nowIso,
          animeRow: input.animeRow,
          title: input.item.title,
          magnet: input.item.magnet,
          infoHash: input.item.infoHash,
          unitNumber: coveragePlan.requestedEpisode ?? input.unitNumber,
          isBatch: coveragePlan.effectiveIsBatch,
          coveredUnitsJson: coveredUnits,
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
              ...(input.item.seaDexTags === undefined ? {} : { seadexTags: input.item.seaDexTags }),
              ...(input.item.viewUrl === undefined ? {} : { sourceUrl: input.item.viewUrl }),
              title: input.item.title,
              trusted: input.item.trusted,
            }),
          ),
          ...(input.item.group === undefined ? {} : { group: input.item.group }),
          totalBytes: input.item.sizeBytes,
          event: { type: input.eventType, message: input.eventMessage },
          conflictPolicy: "skip",
        });

        return yield* downloadTriggerGate
          .withPermits(1)(queueEffect)
          .pipe(
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
  );
}

export const BackgroundSearchQueueServiceLive = BackgroundSearchQueueService.layer;
