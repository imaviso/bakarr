import { assertEquals } from "@std/assert";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Layer } from "effect";

import { AniListClient, AniListClientLive } from "./anilist.ts";

Deno.test("AniListClient uses provided HttpClient for search", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    const results = await Effect.runPromise(
      Effect.flatMap(
        AniListClient,
        (client) => client.searchAnimeMetadata("custom remote anime"),
      ).pipe(
        Effect.provide(
          AniListClientLive.pipe(
            Layer.provide(
              Layer.succeed(
                HttpClient.HttpClient,
                makeAniListClient([
                  {
                    bannerImage: "https://example.com/banner.png",
                    coverImage: { extraLarge: "https://example.com/cover.png" },
                    description: "Search result description",
                    endDate: { year: 2024 },
                    episodes: 24,
                    format: "TV",
                    genres: ["Action", "Adventure"],
                    id: 777,
                    relations: {
                      edges: [{
                        node: {
                          averageScore: 84,
                          coverImage: {
                            large: "https://example.com/sequel-cover.png",
                          },
                          format: "TV",
                          id: 778,
                          startDate: { month: 7, year: 2025 },
                          status: "NOT_YET_RELEASED",
                          title: {
                            english: "Custom Remote Anime 2nd Season",
                            romaji: "Custom Remote Anime 2nd Season",
                          },
                        },
                        relationType: "SEQUEL",
                      }],
                    },
                    recommendations: {
                      nodes: [{
                        mediaRecommendation: {
                          averageScore: 81,
                          coverImage: {
                            large: "https://example.com/reco-cover.png",
                          },
                          format: "TV",
                          id: 779,
                          startDate: { month: 10, year: 2024 },
                          status: "FINISHED",
                          title: {
                            english: "Recommended Search Result",
                            romaji: "Recommended Search Result",
                          },
                        },
                      }],
                    },
                    startDate: { day: 5, month: 4, year: 2024 },
                    status: "RELEASING",
                    synonyms: ["CRA", "Custom Anime"],
                    title: {
                      english: "Custom Remote Anime",
                      native: "Custom Remote Anime Native",
                      romaji: "Custom Remote Anime",
                    },
                  },
                ], null),
              ),
            ),
          ),
        ),
      ) as Effect.Effect<ReturnType<typeof expectedSearchResult>, never, never>,
    );

    assertEquals(results, expectedSearchResult());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("AniListClient uses provided HttpClient for details", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = () =>
      Promise.reject(new Error("unexpected global fetch"));

    const result = await Effect.runPromise(
      Effect.flatMap(
        AniListClient,
        (client) => client.getAnimeMetadataById(321),
      )
        .pipe(
          Effect.provide(
            AniListClientLive.pipe(
              Layer.provide(
                Layer.succeed(
                  HttpClient.HttpClient,
                  makeAniListClient([], {
                    averageScore: 88,
                    bannerImage: "https://example.com/banner.png",
                    coverImage: { large: "https://example.com/cover.png" },
                    description: "Remote description",
                    endDate: { day: 3, month: 2, year: 2024 },
                    episodes: 12,
                    format: "TV",
                    genres: ["Action"],
                    id: 321,
                    idMal: 654,
                    recommendations: {
                      nodes: [{
                        mediaRecommendation: {
                          averageScore: 91,
                          coverImage: {
                            large: "https://example.com/recommended-cover.png",
                          },
                          format: "TV",
                          id: 999,
                          startDate: { month: 10, year: 2023 },
                          status: "FINISHED",
                          title: {
                            english: "Recommended Detail",
                            romaji: "Recommended Detail",
                          },
                        },
                      }],
                    },
                    relations: {
                      edges: [{
                        node: {
                          averageScore: 79,
                          coverImage: {
                            large: "https://example.com/prequel-cover.png",
                          },
                          format: "TV",
                          id: 320,
                          startDate: { month: 10, year: 2023 },
                          status: "FINISHED",
                          title: {
                            english: "Remote Prequel",
                            romaji: "Remote Prequel",
                          },
                        },
                        relationType: "PREQUEL",
                      }],
                    },
                    nextAiringEpisode: {
                      airingAt: 1_706_000_000,
                      episode: 13,
                    },
                    airingSchedule: {
                      nodes: [
                        { airingAt: 1_706_000_000, episode: 13 },
                        { airingAt: 1_706_604_800, episode: 14 },
                      ],
                    },
                    startDate: { day: 2, month: 1, year: 2024 },
                    status: "FINISHED",
                    studios: { nodes: [{ name: "Studio Remote" }] },
                    synonyms: ["Remote Alias"],
                    title: {
                      english: "Remote Detail",
                      native: "Remote Detail Native",
                      romaji: "Remote Detail",
                    },
                  }),
                ),
              ),
            ),
          ),
        ) as Effect.Effect<
          ReturnType<typeof expectedDetailResult>,
          never,
          never
        >,
    );

    assertEquals(result, expectedDetailResult());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function makeAniListClient(
  searchMedia: ReadonlyArray<unknown>,
  detailMedia: unknown,
) {
  return HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(
          JSON.stringify(
            detailMedia === null
              ? {
                data: {
                  Page: {
                    media: searchMedia,
                  },
                },
              }
              : {
                data: {
                  Media: detailMedia,
                },
              },
          ),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      ),
    )
  );
}

function expectedSearchResult() {
  return [
    {
      already_in_library: false,
      banner_image: "https://example.com/banner.png",
      cover_image: "https://example.com/cover.png",
      description: "Search result description",
      end_date: undefined,
      end_year: 2024,
      episode_count: 24,
      format: "TV",
      genres: ["Action", "Adventure"],
      id: 777,
      recommended_anime: [{
        cover_image: "https://example.com/reco-cover.png",
        format: "TV",
        id: 779,
        rating: 81,
        relation_type: undefined,
        season: "fall",
        season_year: 2024,
        start_year: 2024,
        status: "FINISHED",
        title: {
          english: "Recommended Search Result",
          native: undefined,
          romaji: "Recommended Search Result",
        },
      }],
      related_anime: [{
        cover_image: "https://example.com/sequel-cover.png",
        format: "TV",
        id: 778,
        rating: 84,
        relation_type: "SEQUEL",
        season: "summer",
        season_year: 2025,
        start_year: 2025,
        status: "NOT_YET_RELEASED",
        title: {
          english: "Custom Remote Anime 2nd Season",
          native: undefined,
          romaji: "Custom Remote Anime 2nd Season",
        },
      }],
      season: "spring",
      season_year: 2024,
      start_date: "2024-04-05",
      start_year: 2024,
      status: "RELEASING",
      synonyms: ["CRA", "Custom Anime"],
      title: {
        english: "Custom Remote Anime",
        native: "Custom Remote Anime Native",
        romaji: "Custom Remote Anime",
      },
    },
  ];
}

function expectedDetailResult() {
  return {
    bannerImage: "https://example.com/banner.png",
    coverImage: "https://example.com/cover.png",
    description: "Remote description",
    endDate: "2024-02-03",
    endYear: 2024,
    episodeCount: 12,
    format: "TV",
    futureAiringSchedule: [
      { airingAt: "2024-01-23T08:53:20.000Z", episode: 13 },
      { airingAt: "2024-01-30T08:53:20.000Z", episode: 14 },
    ],
    genres: ["Action"],
    id: 321,
    malId: 654,
    nextAiringEpisode: { airingAt: "2024-01-23T08:53:20.000Z", episode: 13 },
    recommendedAnime: [{
      cover_image: "https://example.com/recommended-cover.png",
      format: "TV",
      id: 999,
      rating: 91,
      relation_type: undefined,
      season: "fall",
      season_year: 2023,
      start_year: 2023,
      status: "FINISHED",
      title: {
        english: "Recommended Detail",
        native: undefined,
        romaji: "Recommended Detail",
      },
    }],
    relatedAnime: [{
      cover_image: "https://example.com/prequel-cover.png",
      format: "TV",
      id: 320,
      rating: 79,
      relation_type: "PREQUEL",
      season: "fall",
      season_year: 2023,
      start_year: 2023,
      status: "FINISHED",
      title: {
        english: "Remote Prequel",
        native: undefined,
        romaji: "Remote Prequel",
      },
    }],
    score: 88,
    startDate: "2024-01-02",
    startYear: 2024,
    status: "FINISHED",
    studios: ["Studio Remote"],
    synonyms: ["Remote Alias"],
    title: {
      english: "Remote Detail",
      native: "Remote Detail Native",
      romaji: "Remote Detail",
    },
  };
}
