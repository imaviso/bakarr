import { Effect } from "effect";

import type { AppDatabase } from "../../db/database.ts";
import type { FileSystemShape } from "../../lib/filesystem.ts";
import type { EventPublisherShape } from "../events/publisher.ts";
import { scanAnimeFolderEffect } from "./file-mapping-support.ts";
import {
  appendAnimeLog,
  ensureEpisodes,
  getAnimeRowOrThrow,
} from "./repository.ts";
import { tryAnimePromise, tryDatabasePromise } from "./service-support.ts";

type AnimeEventPublisher = Pick<EventPublisherShape, "publish">;

export const refreshEpisodesEffect = Effect.fn(
  "AnimeService.refreshEpisodesEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  eventPublisher: AnimeEventPublisher;
}) {
  const animeRow = yield* tryAnimePromise(
    "Failed to refresh episodes",
    () => getAnimeRowOrThrow(input.db, input.animeId),
  );

  yield* tryAnimePromise("Failed to refresh episodes", () =>
    ensureEpisodes(
      input.db,
      input.animeId,
      animeRow.episodeCount ?? undefined,
      animeRow.status,
      animeRow.startDate ?? undefined,
      animeRow.endDate ?? undefined,
      false,
    ));
  yield* tryDatabasePromise(
    "Failed to refresh episodes",
    () =>
      appendAnimeLog(
        input.db,
        "anime.episodes.refreshed",
        "success",
        `Refreshed episodes for ${animeRow.titleRomaji}`,
      ),
  );
  yield* input.eventPublisher.publish({
    type: "RefreshFinished",
    payload: { anime_id: input.animeId, title: animeRow.titleRomaji },
  });
});

export const scanAnimeFolderOrchestrationEffect = Effect.fn(
  "AnimeService.scanAnimeFolderOrchestrationEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  eventPublisher: AnimeEventPublisher;
  fs: FileSystemShape;
}) {
  const { animeRow, found, total } = yield* scanAnimeFolderEffect({
    animeId: input.animeId,
    db: input.db,
    fs: input.fs,
  });

  yield* tryDatabasePromise(
    "Failed to scan anime folder",
    () =>
      appendAnimeLog(
        input.db,
        "anime.folder.scanned",
        "success",
        `Scanned ${animeRow.titleRomaji} folder and found ${found} files`,
      ),
  );
  yield* input.eventPublisher.publish({
    type: "ScanFolderFinished",
    payload: { anime_id: input.animeId, found, title: animeRow.titleRomaji },
  });

  return { found, total };
});
