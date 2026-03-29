import { Context, Effect, Layer } from "effect";

import { Database, DatabaseError } from "@/db/database.ts";
import { ClockService } from "@/lib/clock.ts";
import { AniListClient } from "@/features/anime/anilist.ts";
import type {
  AnimeListQueryParams,
  AnimeListResponse,
  AnimeSearchResponse,
  AnimeSearchResult,
  Anime,
  Episode,
} from "@packages/shared/index.ts";
import {
  type AnimeServiceError,
  AnimeStoredDataError,
  AnimeNotFoundError,
} from "@/features/anime/errors.ts";
import { ExternalCallError } from "@/lib/effect-retry.ts";
import {
  listAnimeEffect,
  getAnimeEffect,
  searchAnimeEffect,
  getAnimeByAnilistIdEffect,
  listEpisodesEffect,
} from "@/features/anime/query-support.ts";

export interface AnimeQueryServiceShape {
  readonly listAnime: (
    params?: AnimeListQueryParams,
  ) => Effect.Effect<AnimeListResponse, DatabaseError | AnimeStoredDataError>;
  readonly getAnime: (id: number) => Effect.Effect<Anime, AnimeServiceError | DatabaseError>;
  readonly searchAnime: (
    query: string,
  ) => Effect.Effect<AnimeSearchResponse, DatabaseError | ExternalCallError | AnimeStoredDataError>;
  readonly getAnimeByAnilistId: (
    id: number,
  ) => Effect.Effect<AnimeSearchResult, AnimeNotFoundError | DatabaseError | ExternalCallError>;
  readonly listEpisodes: (animeId: number) => Effect.Effect<Episode[], DatabaseError>;
}

export class AnimeQueryService extends Context.Tag("@bakarr/api/AnimeQueryService")<
  AnimeQueryService,
  AnimeQueryServiceShape
>() {}

export const AnimeQueryServiceLive = Layer.effect(
  AnimeQueryService,
  Effect.gen(function* () {
    const { db } = yield* Database;
    const aniList = yield* AniListClient;
    const clock = yield* ClockService;

    return {
      getAnime: Effect.fn("AnimeQueryService.getAnime")(function* (id: number) {
        return yield* getAnimeEffect({ db, id });
      }),
      getAnimeByAnilistId: Effect.fn("AnimeQueryService.getAnimeByAnilistId")(function* (
        id: number,
      ) {
        return yield* getAnimeByAnilistIdEffect({ aniList, db, id });
      }),
      listAnime: Effect.fn("AnimeQueryService.listAnime")(function* (
        params?: AnimeListQueryParams,
      ) {
        return yield* listAnimeEffect(db, params);
      }),
      listEpisodes: Effect.fn("AnimeQueryService.listEpisodes")(function* (animeId: number) {
        const now = new Date(yield* clock.currentTimeMillis);
        return yield* listEpisodesEffect({ animeId, db, now });
      }),
      searchAnime: Effect.fn("AnimeQueryService.searchAnime")(function* (query: string) {
        return yield* searchAnimeEffect({ aniList, db, query });
      }),
    } satisfies AnimeQueryServiceShape;
  }),
);
