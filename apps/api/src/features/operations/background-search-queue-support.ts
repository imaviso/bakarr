import { Effect } from "effect";

import type { Config, DownloadAction } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import {
  buildDownloadSelectionMetadata,
  buildDownloadSourceMetadataFromRelease,
  mergeDownloadSourceMetadata,
} from "@/features/operations/naming-support.ts";
import {
  inferCoveredEpisodeNumbers,
  parseCoveredEpisodesEffect,
  toCoveredEpisodesJson,
  hasOverlappingDownload,
} from "@/features/operations/download-lifecycle.ts";
import { parseReleaseName } from "@/features/operations/release-ranking.ts";
import { queueParsedReleaseDownload } from "@/features/operations/release-queue-support.ts";
import { type ParsedRelease } from "@/features/operations/rss-client.ts";
import { type QBitConfig, QBitTorrentClient } from "@/features/operations/qbittorrent.ts";
import type { OperationsCoordinationShape } from "@/features/operations/runtime-support.ts";
import type { TryDatabasePromise } from "@/lib/effect-db.ts";

export interface BackgroundSearchQueueSupportInput {
  readonly db: AppDatabase;
  readonly coordination: OperationsCoordinationShape;
  readonly maybeQBitConfig: (config: Config) => QBitConfig | null;
  readonly nowIso: () => Effect.Effect<string>;
  readonly qbitClient: typeof QBitTorrentClient.Service;
  readonly tryDatabasePromise: TryDatabasePromise;
}

export function makeBackgroundSearchQueueSupport(input: BackgroundSearchQueueSupportInput) {
  const { db, coordination, nowIso, qbitClient, tryDatabasePromise } = input;

  const queueReleaseIfEligible = Effect.fn("OperationsService.queueReleaseIfEligible")(
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
      qbitConfig: QBitConfig | null;
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

        return yield* queueParsedReleaseDownload({
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
          qbitClient,
          qbitConfig: input.qbitConfig,
          tryDatabasePromise,
        });
      });

      return yield* coordination.runExclusiveDownloadTrigger(queueEffect);
    },
  );

  return {
    queueReleaseIfEligible,
  };
}
