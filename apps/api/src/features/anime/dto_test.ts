import { assert, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";

import { anime, episodes } from "@/db/schema.ts";
import { AnimeStoredDataError } from "@/features/anime/errors.ts";
import { toAnimeDto } from "@/features/anime/dto.ts";

it.effect("toAnimeDto builds progress, metadata, and decoded arrays", () =>
  Effect.gen(function* () {
    const result = yield* toAnimeDto(
      {
        addedAt: "2024-01-01T00:00:00.000Z",
        background: "Background lore",
        bannerImage: "/api/images/anime/20/banner.jpg",
        coverImage: "/api/images/anime/20/cover.jpg",
        description: "A ninja story",
        duration: "24 min",
        endDate: null,
        endYear: 2024,
        episodeCount: 4,
        favorites: 100,
        format: "TV",
        genres: '["Action","Adventure"]',
        id: 20,
        malId: 1735,
        members: 300,
        monitored: true,
        nextAiringAt: "2024-01-20T12:00:00.000Z",
        nextAiringEpisode: 5,
        popularity: 11,
        profileName: "Default",
        releaseProfileIds: "[1,2]",
        rootFolder: "/library/Naruto",
        rank: 7,
        rating: "PG-13 - Teens 13 or older",
        score: 79,
        source: "MANGA",
        startDate: null,
        startYear: 2023,
        status: "RELEASING",
        studios: '["Studio Pierrot"]',
        titleEnglish: "Naruto",
        titleNative: "ナルト",
        titleRomaji: "Naruto",
        synonyms: '["Naruto Alt"]',
        relatedAnime:
          '[{"id":10,"relation_type":"PREQUEL","title":{"english":"Naruto Classic","romaji":"Naruto Classic"}}]',
        recommendedAnime: '[{"id":30,"title":{"english":"Boruto","romaji":"Boruto"}}]',
      } satisfies typeof anime.$inferSelect,
      [
        {
          audioChannels: null,
          audioCodec: null,
          aired: null,
          animeId: 20,
          downloaded: true,
          durationSeconds: null,
          filePath: "/library/Naruto/Naruto - 01.mkv",
          fileSize: null,
          groupName: null,
          id: 1,
          number: 1,
          quality: null,
          resolution: null,
          title: null,
          videoCodec: null,
        },
        {
          audioChannels: null,
          audioCodec: null,
          aired: null,
          animeId: 20,
          downloaded: false,
          durationSeconds: null,
          filePath: null,
          fileSize: null,
          groupName: null,
          id: 2,
          number: 2,
          quality: null,
          resolution: null,
          title: null,
          videoCodec: null,
        },
        {
          audioChannels: null,
          audioCodec: null,
          aired: null,
          animeId: 20,
          downloaded: true,
          durationSeconds: null,
          filePath: "/library/Naruto/Naruto - 03.mkv",
          fileSize: null,
          groupName: null,
          id: 3,
          number: 3,
          quality: null,
          resolution: null,
          title: null,
          videoCodec: null,
        },
      ] satisfies Array<typeof episodes.$inferSelect>,
    );

    assert.deepStrictEqual(result.id, 20);
    assert.deepStrictEqual(result.background, "Background lore");
    assert.deepStrictEqual(result.duration, "24 min");
    assert.deepStrictEqual(result.favorites, 100);
    assert.deepStrictEqual(result.genres, ["Action", "Adventure"]);
    assert.deepStrictEqual(result.members, 300);
    assert.deepStrictEqual(result.popularity, 11);
    assert.deepStrictEqual(result.rank, 7);
    assert.deepStrictEqual(result.rating, "PG-13 - Teens 13 or older");
    assert.deepStrictEqual(result.studios, ["Studio Pierrot"]);
    assert.deepStrictEqual(result.release_profile_ids, [1, 2]);
    assert.deepStrictEqual(result.progress.downloaded, 2);
    assert.deepStrictEqual(result.progress.downloaded_percent, 50);
    assert.deepStrictEqual(result.progress.is_up_to_date, false);
    assert.deepStrictEqual(result.progress.latest_downloaded_episode, 3);
    assert.deepStrictEqual(result.progress.total, 4);
    assert.deepStrictEqual(result.progress.missing, [2, 4]);
    assert.deepStrictEqual(result.progress.next_missing_episode, 2);
    assert.deepStrictEqual(result.season, undefined);
    assert.deepStrictEqual(result.season_year, 2023);
    assert.deepStrictEqual(result.title.english, "Naruto");
    assert.deepStrictEqual(result.banner_image, "/api/images/anime/20/banner.jpg");
    assert.deepStrictEqual(result.related_anime?.[0]?.relation_type, "PREQUEL");
    assert.deepStrictEqual(result.recommended_anime?.[0]?.title.english, "Boruto");
    assert.deepStrictEqual(result.start_year, 2023);
    assert.deepStrictEqual(result.synonyms, ["Naruto Alt"]);
    assert.deepStrictEqual(result.end_year, 2024);
    assert.deepStrictEqual(result.source, "MANGA");
    assert.deepStrictEqual(result.next_airing_episode?.episode, 5);
  }),
);

it.effect("toAnimeDto handles anime with unknown episode totals", () =>
  Effect.gen(function* () {
    const result = yield* toAnimeDto(
      {
        addedAt: "2024-01-01T00:00:00.000Z",
        background: null,
        bannerImage: null,
        coverImage: null,
        description: null,
        duration: null,
        endDate: null,
        endYear: null,
        episodeCount: null,
        favorites: null,
        format: "MOVIE",
        genres: "[]",
        id: 99,
        malId: null,
        members: null,
        monitored: false,
        nextAiringAt: null,
        nextAiringEpisode: null,
        profileName: "Default",
        popularity: null,
        releaseProfileIds: "[]",
        rootFolder: "/library/Movie",
        rank: null,
        rating: null,
        score: null,
        source: null,
        startDate: null,
        startYear: null,
        status: "FINISHED",
        studios: "[]",
        titleEnglish: null,
        titleNative: null,
        titleRomaji: "Movie",
        synonyms: null,
        relatedAnime: null,
        recommendedAnime: null,
      } satisfies typeof anime.$inferSelect,
      [],
    );

    assert.deepStrictEqual(result.progress.total, undefined);
    assert.deepStrictEqual(result.progress.downloaded_percent, undefined);
    assert.deepStrictEqual(result.progress.is_up_to_date, undefined);
    assert.deepStrictEqual(result.progress.missing, []);
    assert.deepStrictEqual(result.progress.latest_downloaded_episode, undefined);
    assert.deepStrictEqual(result.progress.next_missing_episode, undefined);
    assert.deepStrictEqual(result.cover_image, undefined);
    assert.deepStrictEqual(result.score, undefined);
  }),
);

it.effect("toAnimeDto fails with typed stored-data errors for corrupt persisted JSON", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(
      toAnimeDto(
        {
          addedAt: "2024-01-01T00:00:00.000Z",
          background: null,
          bannerImage: null,
          coverImage: null,
          description: null,
          duration: null,
          endDate: null,
          endYear: null,
          episodeCount: 1,
          favorites: null,
          format: "TV",
          genres: "not-json",
          id: 100,
          malId: null,
          members: null,
          monitored: false,
          nextAiringAt: null,
          nextAiringEpisode: null,
          profileName: "Default",
          popularity: null,
          releaseProfileIds: "[]",
          rootFolder: "/library/Bad",
          rank: null,
          rating: null,
          score: null,
          source: null,
          startDate: null,
          startYear: null,
          status: "FINISHED",
          studios: "[]",
          titleEnglish: null,
          titleNative: null,
          titleRomaji: "Bad",
          synonyms: null,
          relatedAnime: null,
          recommendedAnime: null,
        } satisfies typeof anime.$inferSelect,
        [],
      ),
    );

    assert.deepStrictEqual(Exit.isFailure(exit), true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      assert.deepStrictEqual(failure._tag, "Some");
      if (failure._tag === "Some") {
        assert.deepStrictEqual(failure.value instanceof AnimeStoredDataError, true);
      }
    }
  }),
);
