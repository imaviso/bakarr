import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type {
  Anime,
  AnimeSearchResult,
  Episode,
} from "../../../../../packages/shared/src/index.ts";
import type { AppDatabase } from "../../db/database.ts";
import { anime, episodes } from "../../db/schema.ts";
import type { AniListClient } from "./anilist.ts";
import { toAnimeDto } from "./dto.ts";
import { AnimeNotFoundError } from "./errors.ts";
import {
  getAnimeRowOrThrow,
  markSearchResultsAlreadyInLibrary,
} from "./repository.ts";
import { tryAnimePromise, tryDatabasePromise } from "./service-support.ts";

function indexEpisodesByAnimeId(
  rows: ReadonlyArray<typeof episodes.$inferSelect>,
) {
  const rowsByAnimeId = new Map<number, Array<typeof episodes.$inferSelect>>();

  for (const row of rows) {
    const bucket = rowsByAnimeId.get(row.animeId);

    if (bucket) {
      bucket.push(row);
    } else {
      rowsByAnimeId.set(row.animeId, [row]);
    }
  }

  return rowsByAnimeId;
}

export const listAnimeEffect = Effect.fn("AnimeService.listAnimeEffect")(
  function* (db: AppDatabase) {
    const animeRows = yield* tryDatabasePromise(
      "Failed to list anime",
      () => db.select().from(anime),
    );
    const episodeRows = yield* tryDatabasePromise(
      "Failed to list anime",
      () => db.select().from(episodes),
    );
    const episodesByAnimeId = indexEpisodesByAnimeId(episodeRows);

    return animeRows.map((row): Anime =>
      toAnimeDto(row, episodesByAnimeId.get(row.id) ?? [])
    );
  },
);

export const getAnimeEffect = Effect.fn("AnimeService.getAnimeEffect")(
  function* (input: { db: AppDatabase; id: number }) {
    const row = yield* tryAnimePromise(
      "Failed to load anime",
      () => getAnimeRowOrThrow(input.db, input.id),
    );
    const episodeRows = yield* tryAnimePromise(
      "Failed to load anime",
      () =>
        input.db.select().from(episodes).where(eq(episodes.animeId, input.id)),
    );

    return toAnimeDto(row, episodeRows);
  },
);

export const searchAnimeEffect = Effect.fn("AnimeService.searchAnimeEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    db: AppDatabase;
    query: string;
  }) {
    const results = yield* input.aniList.searchAnimeMetadata(input.query);

    return yield* tryDatabasePromise(
      "Failed to check library status",
      () => markSearchResultsAlreadyInLibrary(input.db, results),
    );
  },
);

export const getAnimeByAnilistIdEffect = Effect.fn(
  "AnimeService.getAnimeByAnilistIdEffect",
)(function* (input: {
  aniList: typeof AniListClient.Service;
  db: AppDatabase;
  id: number;
}) {
  const metadata = yield* input.aniList.getAnimeMetadataById(input.id);

  if (!metadata) {
    return yield* new AnimeNotFoundError({
      message: "Anime not found",
    });
  }

  const existing = yield* tryDatabasePromise(
    "Failed to check library status",
    () =>
      input.db.select({ id: anime.id }).from(anime).where(
        eq(anime.id, input.id),
      )
        .limit(1),
  );

  return {
    already_in_library: Boolean(existing[0]),
    cover_image: metadata.coverImage,
    episode_count: metadata.episodeCount,
    format: metadata.format,
    id: metadata.id,
    status: metadata.status,
    title: metadata.title,
  } satisfies AnimeSearchResult;
});

export const listEpisodesEffect = Effect.fn("AnimeService.listEpisodesEffect")(
  function* (db: AppDatabase, animeId: number) {
    const rows = yield* tryDatabasePromise(
      "Failed to list episodes",
      () => db.select().from(episodes).where(eq(episodes.animeId, animeId)),
    );

    return rows.sort((left, right) => left.number - right.number).map((
      row,
    ): Episode => ({
      aired: row.aired ?? undefined,
      downloaded: row.downloaded,
      file_path: row.filePath ?? undefined,
      number: row.number,
      title: row.title ?? undefined,
    }));
  },
);
