import { Context, Effect, Layer } from "effect";

import type { DownloadAction } from "@packages/shared/index.ts";
import { Database, type DatabaseError } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "@/features/operations/naming-support.ts";
import {
  hasOverlappingDownload,
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
} from "@/features/operations/download-coverage.ts";
import { parseReleaseName } from "@/features/operations/release-ranking.ts";
import { queueParsedReleaseDownload } from "@/features/operations/release-queue-support.ts";
import type { ParsedRelease } from "@/features/operations/rss-client-parse.ts";
import { TorrentClientService } from "@/features/operations/torrent-client-service.ts";
import { DownloadTriggerCoordinator } from "@/features/operations/runtime-support.ts";
import { ClockService, nowIsoFromClock } from "@/lib/clock.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { OperationsInfrastructureError } from "@/features/operations/errors.ts";

export interface BackgroundSearchQueueServiceShape {
  readonly queueReleaseIfEligible: (input: {
    animeRow: typeof anime.$inferSelect;
    contextMessage: string;
    decisionReason?: string;
    action?: DownloadAction;
    episodeNumber: number;
    eventMessage: string;
    eventType: string;
    item: ParsedRelease;
    missingEpisodes: readonly number[];
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
        animeRow: typeof anime.$inferSelect;
        contextMessage: string;
        decisionReason?: string;
        action?: DownloadAction;
        episodeNumber: number;
        eventMessage: string;
        eventType: string;
        item: ParsedRelease;
        missingEpisodes: readonly number[];
      }) {
        const parsedRelease = parseReleaseName(input.item.title);
        const coveredEpisodes = toCoveredEpisodesJson(
          inferCoveredEpisodeNumbers({
            explicitEpisodes: parsedRelease.episodeNumbers,
            isBatch: parsedRelease.isBatch,
            totalEpisodes: input.animeRow.episodeCount,
            missingEpisodes: input.missingEpisodes,
            requestedEpisode: input.episodeNumber,
          }),
        );

        const queueEffect = Effect.gen(function* () {
          const parsedCoveredEpisodes = yield* parseCoveredEpisodesEffect(coveredEpisodes);
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
            coveredEpisodes,
            db,
            episodeNumber: input.episodeNumber,
            eventMessage: input.eventMessage,
            eventType: input.eventType,
            isBatch: parsedRelease.isBatch,
            item: input.item,
            nowIso,
            sourceMetadata: mergeDownloadSourceMetadata(
              buildDownloadSourceMetadataFromRelease({
                ...buildDownloadSelectionMetadata(input.action),
                decisionReason: input.decisionReason,
                group: input.item.group,
                indexer: "Nyaa",
                isSeadex: input.item.isSeaDex,
                isSeadexBest: input.item.isSeaDexBest,
                remake: input.item.remake,
                seadexComparison: input.item.seaDexComparison,
                seadexDualAudio: input.item.seaDexDualAudio,
                seadexNotes: input.item.seaDexNotes,
                seadexReleaseGroup: input.item.seaDexReleaseGroup,
                seadexTags: input.item.seaDexTags,
                sourceUrl: input.item.viewUrl,
                title: input.item.title,
                trusted: input.item.trusted,
              }),
            ),
            torrentClientService,
            tryDatabasePromise,
          });

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
