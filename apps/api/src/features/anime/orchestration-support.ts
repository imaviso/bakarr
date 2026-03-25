import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import { anime } from "../../db/schema.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { MediaProbeShape } from "../../lib/media-probe.ts";
import type { EventPublisherShape } from "../events/publisher.ts";
import { markJobFailed, markJobStarted, markJobSucceeded } from "../operations/job-support.ts";
import { appendSystemLog } from "../system/support.ts";
import type { AniListClient } from "./anilist.ts";
import { encodeAnimeDiscoveryEntries, encodeAnimeSynonyms } from "./discovery-metadata-codec.ts";
import { scanAnimeFolderEffect } from "./file-mapping-support.ts";
import {
  appendAnimeLogEffect,
  ensureEpisodesEffect,
  getAnimeRowEffect,
  updateAnimeEpisodeAirDatesEffect,
} from "./repository.ts";
import { tryDatabasePromise, updateAnimeRow, wrapAnimeError } from "./service-support.ts";

type AnimeEventPublisher = Pick<EventPublisherShape, "publish" | "publishInfo">;

const quietAnimeEventPublisher: AnimeEventPublisher = {
  publish: () => Effect.void,
  publishInfo: () => Effect.void,
};

const syncAnimeMetadataEffect = Effect.fn("AnimeService.syncAnimeMetadataEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeId: number;
    db: AppDatabase;
    eventPublisher: AnimeEventPublisher;
    nowIso: () => Effect.Effect<string>;
  }) {
    const nowIso = input.nowIso;
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId).pipe(
      Effect.mapError(wrapAnimeError("Failed to refresh episodes")),
    );
    const metadata = yield* input.aniList.getAnimeMetadataById(input.animeId);

    if (!metadata) {
      return { animeRow, metadata: undefined, nextAnimeRow: animeRow };
    }

    const nextAnimeRow = {
      ...animeRow,
      bannerImage: metadata.bannerImage ?? animeRow.bannerImage,
      coverImage: metadata.coverImage ?? animeRow.coverImage,
      description: metadata.description ?? animeRow.description,
      endDate: metadata.endDate ?? null,
      endYear: metadata.endYear ?? null,
      episodeCount: metadata.episodeCount ?? animeRow.episodeCount,
      format: metadata.format,
      malId: metadata.malId ?? animeRow.malId,
      nextAiringAt: metadata.nextAiringEpisode?.airingAt ?? null,
      nextAiringEpisode: metadata.nextAiringEpisode?.episode ?? null,
      recommendedAnime: encodeAnimeDiscoveryEntries(metadata.recommendedAnime),
      relatedAnime: encodeAnimeDiscoveryEntries(metadata.relatedAnime),
      score: metadata.score ?? animeRow.score,
      startDate: metadata.startDate ?? null,
      startYear: metadata.startYear ?? null,
      status: metadata.status,
      synonyms: encodeAnimeSynonyms(metadata.synonyms),
      titleEnglish: metadata.title.english ?? animeRow.titleEnglish,
      titleNative: metadata.title.native ?? animeRow.titleNative,
      titleRomaji: metadata.title.romaji,
    };

    yield* updateAnimeRow(
      input.db,
      input.animeId,
      nextAnimeRow,
      `Refreshed metadata for ${animeRow.titleRomaji}`,
      input.eventPublisher,
      nowIso,
    );

    return { animeRow, metadata, nextAnimeRow };
  },
);

export const refreshEpisodesEffect = Effect.fn("AnimeService.refreshEpisodesEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeId: number;
    db: AppDatabase;
    eventPublisher: AnimeEventPublisher;
    nowIso: () => Effect.Effect<string>;
  }) {
    const nowIso = input.nowIso;
    const { animeRow, metadata, nextAnimeRow } = yield* syncAnimeMetadataEffect({
      aniList: input.aniList,
      animeId: input.animeId,
      db: input.db,
      eventPublisher: input.eventPublisher,
      nowIso,
    });

    yield* ensureEpisodesEffect(
      input.db,
      input.animeId,
      nextAnimeRow.episodeCount ?? undefined,
      nextAnimeRow.status,
      nextAnimeRow.startDate ?? undefined,
      nextAnimeRow.endDate ?? undefined,
      metadata?.futureAiringSchedule,
      false,
      nowIso,
    ).pipe(Effect.mapError(wrapAnimeError("Failed to refresh episodes")));
    yield* updateAnimeEpisodeAirDatesEffect(
      input.db,
      input.animeId,
      nextAnimeRow.episodeCount ?? undefined,
      nextAnimeRow.status,
      nextAnimeRow.startDate ?? undefined,
      nextAnimeRow.endDate ?? undefined,
      metadata?.futureAiringSchedule,
      nowIso,
    ).pipe(Effect.mapError(wrapAnimeError("Failed to refresh episodes")));
    yield* appendAnimeLogEffect(
      input.db,
      "anime.episodes.refreshed",
      "success",
      `Refreshed episodes for ${animeRow.titleRomaji}`,
      nowIso,
    );
    yield* input.eventPublisher.publish({
      type: "RefreshFinished",
      payload: { anime_id: input.animeId, title: animeRow.titleRomaji },
    });
  },
);

export const refreshMetadataForMonitoredAnimeEffect = Effect.fn(
  "AnimeService.refreshMetadataForMonitoredAnimeEffect",
)(function* (input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  nowIso: () => Effect.Effect<string>;
}) {
  const nowIso = input.nowIso;
  yield* markJobStarted(input.db, "metadata_refresh", nowIso);
  yield* appendSystemLog(
    input.db,
    "system.task.metadata_refresh.started",
    "info",
    "Metadata refresh started",
    nowIso,
  );

  return yield* Effect.gen(function* () {
    const animeRows = yield* tryDatabasePromise("Failed to refresh metadata", () =>
      input.db.select().from(anime).where(eq(anime.monitored, true)),
    );
    let refreshed = 0;

    yield* Effect.forEach(
      animeRows,
      (animeRow) =>
        Effect.gen(function* () {
          const { metadata, nextAnimeRow } = yield* syncAnimeMetadataEffect({
            aniList: input.aniList,
            animeId: animeRow.id,
            db: input.db,
            eventPublisher: quietAnimeEventPublisher,
            nowIso,
          });

          yield* ensureEpisodesEffect(
            input.db,
            animeRow.id,
            nextAnimeRow.episodeCount ?? undefined,
            nextAnimeRow.status,
            nextAnimeRow.startDate ?? undefined,
            nextAnimeRow.endDate ?? undefined,
            metadata?.futureAiringSchedule,
            false,
            nowIso,
          ).pipe(Effect.mapError(wrapAnimeError("Failed to refresh metadata")));
          yield* updateAnimeEpisodeAirDatesEffect(
            input.db,
            animeRow.id,
            nextAnimeRow.episodeCount ?? undefined,
            nextAnimeRow.status,
            nextAnimeRow.startDate ?? undefined,
            nextAnimeRow.endDate ?? undefined,
            metadata?.futureAiringSchedule,
            nowIso,
          ).pipe(Effect.mapError(wrapAnimeError("Failed to refresh metadata")));
          refreshed += 1;
        }),
      { concurrency: 4, discard: true },
    );

    const message = `Refreshed ${refreshed} monitored anime`;

    yield* markJobSucceeded(input.db, "metadata_refresh", message, nowIso);
    yield* appendSystemLog(
      input.db,
      "system.task.metadata_refresh.completed",
      "success",
      message,
      nowIso,
    );

    return { refreshed };
  }).pipe(
    Effect.catchAll((cause) =>
      markJobFailed(input.db, "metadata_refresh", cause, nowIso).pipe(
        Effect.zipRight(
          appendSystemLog(
            input.db,
            "system.task.metadata_refresh.failed",
            "error",
            cause instanceof Error ? cause.message : String(cause),
            nowIso,
          ),
        ),
        Effect.zipRight(Effect.fail(cause)),
      ),
    ),
  );
});

export const scanAnimeFolderOrchestrationEffect = Effect.fn(
  "AnimeService.scanAnimeFolderOrchestrationEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  eventPublisher: AnimeEventPublisher;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  nowIso: () => Effect.Effect<string>;
}) {
  const nowIso = input.nowIso;
  const { animeRow, found, total } = yield* scanAnimeFolderEffect({
    animeId: input.animeId,
    db: input.db,
    fs: input.fs,
    mediaProbe: input.mediaProbe,
    nowIso,
  });

  yield* appendAnimeLogEffect(
    input.db,
    "anime.folder.scanned",
    "success",
    `Scanned ${animeRow.titleRomaji} folder and found ${found} files`,
    nowIso,
  );
  yield* input.eventPublisher.publish({
    type: "ScanFolderFinished",
    payload: { anime_id: input.animeId, found, title: animeRow.titleRomaji },
  });

  return { found, total };
});
