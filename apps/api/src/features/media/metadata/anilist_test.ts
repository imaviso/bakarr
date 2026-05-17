import { assert, it } from "@effect/vitest";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Layer, Option } from "effect";

import { AniListClient, AniListClientLive } from "@/features/media/metadata/anilist.ts";
import { ClockServiceLive } from "@/infra/clock.ts";
import { ExternalCallLive } from "@/infra/effect/retry.ts";

const ExternalCallTestLayer = ExternalCallLive.pipe(Layer.provide(ClockServiceLive));

it.scoped("AniListClient decodes search responses from the provided HttpClient", () =>
  Effect.gen(function* () {
    let requestCount = 0;

    const clientLayer = AniListClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            makeAniListClient(
              () => {
                requestCount += 1;
              },
              [
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
                    edges: [
                      {
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
                            english: "Custom Remote Media 2nd Season",
                            romaji: "Custom Remote Media 2nd Season",
                          },
                        },
                        relationType: "SEQUEL",
                      },
                    ],
                  },
                  recommendations: {
                    nodes: [
                      {
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
                      },
                    ],
                  },
                  startDate: { day: 5, month: 4, year: 2024 },
                  status: "RELEASING",
                  synonyms: ["CRA", "Custom Media"],
                  title: {
                    english: "Custom Remote Media",
                    native: "Custom Remote Media Native",
                    romaji: "Custom Remote Media",
                  },
                },
              ],
              null,
            ),
          ),
        ),
      ),
    );

    const results = yield* Effect.flatMap(AniListClient, (client) =>
      client.searchAnimeMetadata("custom remote media"),
    ).pipe(Effect.provide(clientLayer));
    const expected = expectedSearchResult();
    const first = results[0];
    const expectedFirst = expected[0];

    assert.deepStrictEqual(results.length, expected.length);
    assert.deepStrictEqual(first?.already_in_library, expectedFirst?.already_in_library);
    assert.deepStrictEqual(first?.banner_image, expectedFirst?.banner_image);
    assert.deepStrictEqual(first?.cover_image, expectedFirst?.cover_image);
    assert.deepStrictEqual(first?.description, expectedFirst?.description);
    assert.deepStrictEqual(first?.end_date, expectedFirst?.end_date);
    assert.deepStrictEqual(first?.end_year, expectedFirst?.end_year);
    assert.deepStrictEqual(first?.unit_count, expectedFirst?.unit_count);
    assert.deepStrictEqual(first?.format, expectedFirst?.format);
    assert.deepStrictEqual(first?.genres, expectedFirst?.genres);
    assert.deepStrictEqual(first?.id, expectedFirst?.id);
    assert.deepStrictEqual(first?.season, expectedFirst?.season);
    assert.deepStrictEqual(first?.season_year, expectedFirst?.season_year);
    assert.deepStrictEqual(first?.start_date, expectedFirst?.start_date);
    assert.deepStrictEqual(first?.start_year, expectedFirst?.start_year);
    assert.deepStrictEqual(first?.status, expectedFirst?.status);
    assert.deepStrictEqual(first?.synonyms, expectedFirst?.synonyms);
    assert.deepStrictEqual(first?.title, expectedFirst?.title);
    assert.deepStrictEqual(first?.related_media?.length, expectedFirst?.related_media.length);
    assert.deepStrictEqual(first?.related_media?.[0]?.id, expectedFirst?.related_media[0]?.id);
    assert.deepStrictEqual(
      first?.related_media?.[0]?.relation_type,
      expectedFirst?.related_media[0]?.relation_type,
    );
    assert.deepStrictEqual(
      first?.recommended_media?.length,
      expectedFirst?.recommended_media.length,
    );
    assert.deepStrictEqual(
      first?.recommended_media?.[0]?.id,
      expectedFirst?.recommended_media[0]?.id,
    );
    assert.deepStrictEqual(requestCount, 1);
  }),
);

it.scoped("AniListClient decodes detail responses from the provided HttpClient", () =>
  Effect.gen(function* () {
    let requestCount = 0;

    const clientLayer = AniListClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            makeAniListClient(
              () => {
                requestCount += 1;
              },
              [],
              {
                averageScore: 88,
                bannerImage: "https://example.com/banner.png",
                coverImage: { large: "https://example.com/cover.png" },
                description: "Remote description",
                duration: 24,
                endDate: { day: 3, month: 2, year: 2024 },
                episodes: 12,
                favourites: 12000,
                format: "TV",
                genres: ["Action"],
                id: 321,
                idMal: 654,
                popularity: 450000,
                rankings: [
                  {
                    allTime: true,
                    rank: 9,
                    type: "RATED",
                  },
                  {
                    allTime: true,
                    rank: 15,
                    type: "POPULAR",
                  },
                ],
                recommendations: {
                  nodes: [
                    {
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
                    },
                  ],
                },
                relations: {
                  edges: [
                    {
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
                    },
                  ],
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
                source: "MANGA",
                synonyms: ["Remote Alias"],
                title: {
                  english: "Remote Detail",
                  native: "Remote Detail Native",
                  romaji: "Remote Detail",
                },
              },
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(AniListClient, (client) =>
      client.getAnimeMetadataById(321),
    ).pipe(Effect.provide(clientLayer));

    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      const expected = expectedDetailResult();

      assert.deepStrictEqual(result.value.bannerImage, expected.bannerImage);
      assert.deepStrictEqual(result.value.coverImage, expected.coverImage);
      assert.deepStrictEqual(result.value.description, expected.description);
      assert.deepStrictEqual(result.value.endDate, expected.endDate);
      assert.deepStrictEqual(result.value.endYear, expected.endYear);
      assert.deepStrictEqual(result.value.unitCount, expected.unitCount);
      assert.deepStrictEqual(result.value.format, expected.format);
      assert.deepStrictEqual(result.value.futureAiringSchedule, expected.futureAiringSchedule);
      assert.deepStrictEqual(result.value.genres, expected.genres);
      assert.deepStrictEqual(result.value.id, expected.id);
      assert.deepStrictEqual(result.value.malId, expected.malId);
      assert.deepStrictEqual(result.value.nextAiringUnit, expected.nextAiringUnit);
      assert.deepStrictEqual(
        result.value.recommendedMedia?.length,
        expected.recommendedMedia.length,
      );
      assert.deepStrictEqual(
        result.value.recommendedMedia?.[0]?.id,
        expected.recommendedMedia[0]?.id,
      );
      assert.deepStrictEqual(result.value.relatedMedia?.length, expected.relatedMedia.length);
      assert.deepStrictEqual(result.value.relatedMedia?.[0]?.id, expected.relatedMedia[0]?.id);
      assert.deepStrictEqual(result.value.score, expected.score);
      assert.deepStrictEqual(result.value.duration, expected.duration);
      assert.deepStrictEqual(result.value.favorites, expected.favorites);
      assert.deepStrictEqual(result.value.members, expected.members);
      assert.deepStrictEqual(result.value.popularity, expected.popularity);
      assert.deepStrictEqual(result.value.rank, expected.rank);
      assert.deepStrictEqual(result.value.source, expected.source);
      assert.deepStrictEqual(result.value.startDate, expected.startDate);
      assert.deepStrictEqual(result.value.startYear, expected.startYear);
      assert.deepStrictEqual(result.value.status, expected.status);
      assert.deepStrictEqual(result.value.studios, expected.studios);
      assert.deepStrictEqual(result.value.synonyms, expected.synonyms);
      assert.deepStrictEqual(result.value.title, expected.title);
    }

    assert.deepStrictEqual(requestCount, 1);
  }),
);

it.scoped("AniListClient keeps next airing as future schedule fallback", () =>
  Effect.gen(function* () {
    const clientLayer = AniListClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            makeAniListClient(() => {}, [], {
              airingSchedule: {
                nodes: [],
              },
              id: 321,
              nextAiringEpisode: {
                airingAt: 1_706_000_000,
                episode: 13,
              },
              status: "RELEASING",
              title: {
                romaji: "Remote Detail",
              },
            }),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(AniListClient, (client) =>
      client.getAnimeMetadataById(321),
    ).pipe(Effect.provide(clientLayer));

    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.deepStrictEqual(result.value.futureAiringSchedule, [
        { airingAt: "2024-01-23T08:53:20.000Z", episode: 13 },
      ]);
    }
  }),
);

it.scoped("AniListClient decodes seasonal responses and backfills missing season/year", () =>
  Effect.gen(function* () {
    let requestCount = 0;

    const seasonalMedia = [
      {
        id: 1001,
        title: { english: "Winter 2025 Media A", romaji: "Winter 2025 Media A" },
        format: "TV",
        status: "RELEASING",
        episodes: 12,
        startDate: { day: 5, month: 1, year: 2025 },
        genres: ["Action", "Drama"],
        coverImage: { extraLarge: "https://example.com/winter-a.png" },
        popularity: 200000,
        favourites: 5000,
      },
      {
        id: 1002,
        title: { romaji: "No Date Media" },
        format: "TV",
        status: "NOT_YET_RELEASED",
        episodes: null,
        genres: ["Comedy"],
        coverImage: { large: "https://example.com/nodate.png" },
        popularity: 80000,
        favourites: 2000,
      },
    ];

    const clientLayer = AniListClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            makeAniListClient(
              () => {
                requestCount += 1;
              },
              seasonalMedia,
              null,
            ),
          ),
        ),
      ),
    );

    const results = yield* Effect.flatMap(AniListClient, (client) =>
      client.getSeasonalAnime({ season: "winter", year: 2025, limit: 10 }),
    ).pipe(Effect.provide(clientLayer));

    assert.deepStrictEqual(results.length, 2);

    const first = results[0];
    assert.deepStrictEqual(first?.id, 1001);
    assert.deepStrictEqual(first?.season, "winter");
    assert.deepStrictEqual(first?.season_year, 2025);
    assert.deepStrictEqual(first?.start_date, "2025-01-05");

    const second = results[1];
    assert.deepStrictEqual(second?.id, 1002);
    assert.deepStrictEqual(second?.season, "winter");
    assert.deepStrictEqual(second?.season_year, 2025);
    assert.deepStrictEqual(second?.start_date, undefined);

    assert.deepStrictEqual(requestCount, 1);
  }),
);

function makeAniListClient(
  onRequest: () => void,
  searchMedia: ReadonlyArray<unknown>,
  detailMedia: unknown,
) {
  return HttpClient.make((request) =>
    Effect.sync(() => {
      onRequest();

      return HttpClientResponse.fromWeb(
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
      );
    }),
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
      unit_count: 24,
      format: "TV",
      genres: ["Action", "Adventure"],
      id: 777,
      recommended_media: [
        {
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
        },
      ],
      related_media: [
        {
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
            english: "Custom Remote Media 2nd Season",
            native: undefined,
            romaji: "Custom Remote Media 2nd Season",
          },
        },
      ],
      season: "spring",
      season_year: 2024,
      start_date: "2024-04-05",
      start_year: 2024,
      status: "RELEASING",
      synonyms: ["CRA", "Custom Media"],
      title: {
        english: "Custom Remote Media",
        native: "Custom Remote Media Native",
        romaji: "Custom Remote Media",
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
    unitCount: 12,
    format: "TV",
    source: "MANGA",
    futureAiringSchedule: [
      { airingAt: "2024-01-23T08:53:20.000Z", episode: 13 },
      { airingAt: "2024-01-30T08:53:20.000Z", episode: 14 },
    ],
    genres: ["Action"],
    id: 321,
    malId: 654,
    duration: "24 min",
    favorites: 12000,
    members: 450000,
    popularity: 15,
    rank: 9,
    nextAiringUnit: { airingAt: "2024-01-23T08:53:20.000Z", episode: 13 },
    recommendedMedia: [
      {
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
      },
    ],
    relatedMedia: [
      {
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
      },
    ],
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
