import { HttpClient, HttpClientResponse } from "@effect/platform";
import { assert, it } from "@effect/vitest";
import { Effect, Either, Layer, Option } from "effect";

import { JikanClient, JikanClientLive } from "@/features/anime/jikan.ts";
import { ClockServiceLive } from "@/infra/clock.ts";
import { ExternalCallError, ExternalCallLive } from "@/infra/effect/retry.ts";

const ExternalCallTestLayer = ExternalCallLive.pipe(Layer.provide(ClockServiceLive));

it.scoped("JikanClient maps full detail with recommendations", () =>
  Effect.gen(function* () {
    let requestCount = 0;

    const clientLayer = JikanClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            makeJikanClient(() => {
              requestCount += 1;
            }),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) =>
      client.getAnimeByMalId(5114),
    ).pipe(Effect.provide(clientLayer));

    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.deepStrictEqual(result.value.malId, 5114);
      assert.deepStrictEqual(result.value.url, "https://myanimelist.net/anime/5114");
      assert.deepStrictEqual(result.value.title.romaji, "Fullmetal Alchemist: Brotherhood");
      assert.deepStrictEqual(result.value.title.english, "Fullmetal Alchemist: Brotherhood");
      assert.deepStrictEqual(result.value.title.native, "鋼の錬金術師 FULLMETAL ALCHEMIST");
      assert.deepStrictEqual(result.value.synopsis, "Alchemy meets military thriller.");
      assert.deepStrictEqual(result.value.background, "Award-winning adaptation.");
      assert.deepStrictEqual(result.value.episodeCount, 64);
      assert.deepStrictEqual(result.value.format, "TV");
      assert.deepStrictEqual(result.value.source, "Manga");
      assert.deepStrictEqual(result.value.status, "Finished Airing");
      assert.deepStrictEqual(result.value.airing, false);
      assert.deepStrictEqual(result.value.approved, true);
      assert.deepStrictEqual(result.value.startDate, "2009-04-05");
      assert.deepStrictEqual(result.value.endDate, "2010-07-04");
      assert.deepStrictEqual(result.value.startYear, 2009);
      assert.deepStrictEqual(result.value.endYear, 2010);
      assert.deepStrictEqual(result.value.year, 2009);
      assert.deepStrictEqual(result.value.season, "spring");
      assert.deepStrictEqual(result.value.duration, "24 min per ep");
      assert.deepStrictEqual(result.value.rating, "R - 17+ (violence & profanity)");
      assert.deepStrictEqual(result.value.score, 9.1);
      assert.deepStrictEqual(result.value.scoredBy, 2300000);
      assert.deepStrictEqual(result.value.rank, 1);
      assert.deepStrictEqual(result.value.popularity, 3);
      assert.deepStrictEqual(result.value.members, 4000000);
      assert.deepStrictEqual(result.value.favorites, 300000);
      assert.deepStrictEqual(result.value.genres, ["Action", "Adult Cast", "Military", "Shounen"]);
      assert.deepStrictEqual(result.value.explicitGenres, ["Adult Cast"]);
      assert.deepStrictEqual(result.value.themes, ["Military"]);
      assert.deepStrictEqual(result.value.demographics, ["Shounen"]);
      assert.deepStrictEqual(result.value.studios, ["Bones"]);
      assert.deepStrictEqual(result.value.broadcast, {
        day: "Sundays",
        raw: "Sundays at 17:00 (JST)",
        time: "17:00",
        timezone: "Asia/Tokyo",
      });
      assert.deepStrictEqual(
        result.value.images.jpg?.imageUrl,
        "https://cdn.example/anime/5114.jpg",
      );
      assert.deepStrictEqual(
        result.value.images.webp?.largeImageUrl,
        "https://cdn.example/anime/5114.webp",
      );
      assert.deepStrictEqual(result.value.trailer, {
        embedUrl: "https://www.youtube.com/embed/abcd1234",
        url: "https://www.youtube.com/watch?v=abcd1234",
        youtubeId: "abcd1234",
      });
      assert.deepStrictEqual(result.value.titleVariants, [
        "Hagane no Renkinjutsushi: Fullmetal Alchemist",
        "Fullmetal Alchemist: Brotherhood",
        "鋼の錬金術師 FULLMETAL ALCHEMIST",
      ]);
      assert.deepStrictEqual(result.value.recommendations, [
        {
          malId: 11061,
          title: "Hunter x Hunter (2011)",
          url: "https://myanimelist.net/anime/11061",
        },
      ]);
      assert.deepStrictEqual(result.value.relations, [
        {
          malId: 121,
          relation: "Sequel",
          title: "Fullmetal Alchemist: The Sacred Star of Milos",
          url: "https://myanimelist.net/anime/121",
        },
      ]);
      assert.deepStrictEqual(result.value.producers, [
        {
          malId: 100,
          name: "Aniplex",
          type: "anime",
          url: "https://myanimelist.net/anime/producer/100",
        },
      ]);
      assert.deepStrictEqual(result.value.licensors, [
        {
          malId: 200,
          name: "Funimation",
          type: "anime",
          url: "https://myanimelist.net/anime/producer/200",
        },
      ]);
    }

    assert.deepStrictEqual(requestCount, 2);
  }),
);

it.scoped("JikanClient falls back to basic detail when full endpoint missing", () =>
  Effect.gen(function* () {
    const requests: string[] = [];

    const clientLayer = JikanClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                requests.push(request.url);

                if (request.url.endsWith("/anime/21/full")) {
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(JSON.stringify({ message: "Not Found" }), {
                      headers: { "content-type": "application/json" },
                      status: 404,
                    }),
                  );
                }

                if (request.url.endsWith("/anime/21")) {
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(
                      JSON.stringify({
                        data: {
                          aired: {
                            from: "2005-04-06T00:00:00+00:00",
                            to: "2006-09-27T00:00:00+00:00",
                          },
                          episodes: 51,
                          genres: [{ mal_id: 2, name: "Adventure" }],
                          mal_id: 21,
                          score: 8.1,
                          status: "Finished Airing",
                          studios: [{ mal_id: 4, name: "BONES" }],
                          synopsis: "Two brothers seek the Philosopher's Stone.",
                          title: "Fullmetal Alchemist",
                          title_english: "Fullmetal Alchemist",
                          title_japanese: "鋼の錬金術師",
                          title_synonyms: ["Hagane no Renkinjutsushi"],
                          titles: [{ title: "FMA", type: "Synonym" }],
                          type: "TV",
                          url: "https://myanimelist.net/anime/21",
                        },
                      }),
                      {
                        headers: { "content-type": "application/json" },
                        status: 200,
                      },
                    ),
                  );
                }

                return HttpClientResponse.fromWeb(
                  request,
                  new Response(JSON.stringify({ data: [] }), {
                    headers: { "content-type": "application/json" },
                    status: 200,
                  }),
                );
              }),
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) => client.getAnimeByMalId(21)).pipe(
      Effect.provide(clientLayer),
    );

    assert.deepStrictEqual(requests, [
      "https://api.jikan.moe/v4/anime/21/full",
      "https://api.jikan.moe/v4/anime/21",
      "https://api.jikan.moe/v4/anime/21/recommendations",
    ]);
    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.deepStrictEqual(result.value.malId, 21);
      assert.deepStrictEqual(result.value.titleVariants, [
        "Hagane no Renkinjutsushi",
        "FMA",
        "Fullmetal Alchemist",
        "鋼の錬金術師",
      ]);
      assert.deepStrictEqual(result.value.relations, []);
      assert.deepStrictEqual(result.value.recommendations, []);
    }
  }),
);

it.scoped("JikanClient returns none when both detail endpoints missing", () =>
  Effect.gen(function* () {
    const clientLayer = JikanClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() =>
                HttpClientResponse.fromWeb(
                  request,
                  new Response(JSON.stringify({ message: "Not Found" }), {
                    headers: { "content-type": "application/json" },
                    status: 404,
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) => client.getAnimeByMalId(77)).pipe(
      Effect.provide(clientLayer),
    );

    assert.deepStrictEqual(Option.isNone(result), true);
  }),
);

it.scoped("JikanClient maps detail decode failures with operation name", () =>
  Effect.gen(function* () {
    const clientLayer = JikanClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                if (request.url.endsWith("/anime/7/full")) {
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(JSON.stringify({ message: "Not Found" }), {
                      headers: { "content-type": "application/json" },
                      status: 404,
                    }),
                  );
                }

                return HttpClientResponse.fromWeb(
                  request,
                  new Response(
                    JSON.stringify({
                      data: {
                        mal_id: "invalid",
                      },
                    }),
                    {
                      headers: { "content-type": "application/json" },
                      status: 200,
                    },
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) => client.getAnimeByMalId(7)).pipe(
      Effect.provide(clientLayer),
      Effect.either,
    );

    assert.ok(Either.isLeft(result));
    assert.ok(result.left instanceof ExternalCallError);
    assert.deepStrictEqual(result.left.operation, "jikan.detail.json");
  }),
);

it.scoped("JikanClient ignores missing recommendations endpoint", () =>
  Effect.gen(function* () {
    const clientLayer = JikanClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                if (request.url.endsWith("/anime/44/full")) {
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(JSON.stringify(buildDetailPayload(44)), {
                      headers: { "content-type": "application/json" },
                      status: 200,
                    }),
                  );
                }

                return HttpClientResponse.fromWeb(
                  request,
                  new Response(JSON.stringify({ message: "Not Found" }), {
                    headers: { "content-type": "application/json" },
                    status: 404,
                  }),
                );
              }),
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) => client.getAnimeByMalId(44)).pipe(
      Effect.provide(clientLayer),
    );

    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.deepStrictEqual(result.value.recommendations, []);
    }
  }),
);

it.scoped("JikanClient ignores failing recommendations endpoint", () =>
  Effect.gen(function* () {
    const clientLayer = JikanClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                if (request.url.endsWith("/anime/55/full")) {
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(JSON.stringify(buildDetailPayload(55)), {
                      headers: { "content-type": "application/json" },
                      status: 200,
                    }),
                  );
                }

                if (request.url.endsWith("/anime/55/recommendations")) {
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(JSON.stringify({ message: "Service Unavailable" }), {
                      headers: { "content-type": "application/json" },
                      status: 503,
                    }),
                  );
                }

                return HttpClientResponse.fromWeb(
                  request,
                  new Response(JSON.stringify({ message: "Not Found" }), {
                    headers: { "content-type": "application/json" },
                    status: 404,
                  }),
                );
              }),
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) => client.getAnimeByMalId(55)).pipe(
      Effect.provide(clientLayer),
    );

    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.deepStrictEqual(result.value.malId, 55);
      assert.deepStrictEqual(result.value.recommendations, []);
    }
  }),
);

it.scoped("JikanClient decodes seasonal anime response and applies limit", () =>
  Effect.gen(function* () {
    const clientLayer = JikanClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() => {
                if (request.url.includes("/seasons/2025/spring")) {
                  return HttpClientResponse.fromWeb(
                    request,
                    new Response(JSON.stringify(buildSeasonalPayload()), {
                      headers: { "content-type": "application/json" },
                      status: 200,
                    }),
                  );
                }

                return HttpClientResponse.fromWeb(
                  request,
                  new Response(JSON.stringify({ message: "Not Found" }), {
                    headers: { "content-type": "application/json" },
                    status: 404,
                  }),
                );
              }),
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) =>
      client.getSeasonalAnime({ limit: 2, season: "spring", year: 2025 }),
    ).pipe(Effect.provide(clientLayer));

    assert.deepStrictEqual(result.length, 2);
    const first = result[0]!;
    assert.deepStrictEqual(first.malId, 50001);
    assert.deepStrictEqual(first.title.romaji, "Spring Hero");
    assert.deepStrictEqual(first.title.english, "Spring Hero");
    assert.deepStrictEqual(first.title.native, "春のヒーロー");
    assert.deepStrictEqual(first.format, "TV");
    assert.deepStrictEqual(first.status, "Currently Airing");
    assert.deepStrictEqual(first.season, "spring");
    assert.deepStrictEqual(first.seasonYear, 2025);
    assert.deepStrictEqual(first.startYear, 2025);
    assert.deepStrictEqual(first.coverImage, "https://cdn.example/anime/50001.jpg");
    assert.deepStrictEqual(first.genres, ["Action", "Drama"]);
    assert.deepStrictEqual(first.episodeCount, 12);

    const second = result[1]!;
    assert.deepStrictEqual(second.malId, 50002);
    assert.deepStrictEqual(second.title.romaji, "Spring Fantasy");
    assert.deepStrictEqual(second.genres, ["Fantasy"]);
    assert.deepStrictEqual(second.episodeCount, undefined);
  }),
);

it.scoped("JikanClient getSeasonalAnime returns empty array on 404", () =>
  Effect.gen(function* () {
    const clientLayer = JikanClientLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          ClockServiceLive,
          ExternalCallTestLayer,
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Effect.sync(() =>
                HttpClientResponse.fromWeb(
                  request,
                  new Response(JSON.stringify({ message: "Not Found" }), {
                    headers: { "content-type": "application/json" },
                    status: 404,
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) =>
      client.getSeasonalAnime({ limit: 10, season: "winter", year: 2025 }),
    ).pipe(Effect.provide(clientLayer));

    assert.deepStrictEqual(result.length, 0);
  }),
);

function makeJikanClient(onRequest: () => void) {
  return HttpClient.make((request) =>
    Effect.sync(() => {
      onRequest();

      if (request.url.endsWith("/anime/5114/full")) {
        return HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify(buildDetailPayload(5114)), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        );
      }

      if (request.url.endsWith("/anime/5114/recommendations")) {
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              data: [
                {
                  entry: {
                    mal_id: 11061,
                    title: "Hunter x Hunter (2011)",
                    url: "https://myanimelist.net/anime/11061",
                  },
                },
                {
                  entry: {
                    mal_id: 11061,
                    title: "Hunter x Hunter (2011)",
                    url: "https://myanimelist.net/anime/11061",
                  },
                },
              ],
            }),
            {
              headers: { "content-type": "application/json" },
              status: 200,
            },
          ),
        );
      }

      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify({ message: "Not Found" }), {
          headers: { "content-type": "application/json" },
          status: 404,
        }),
      );
    }),
  );
}

function buildDetailPayload(malId: number) {
  return {
    data: {
      aired: {
        from: "2009-04-05T00:00:00+00:00",
        string: "Apr 5, 2009 to Jul 4, 2010",
        to: "2010-07-04T00:00:00+00:00",
      },
      airing: false,
      approved: true,
      background: "Award-winning adaptation.",
      broadcast: {
        day: "Sundays",
        string: "Sundays at 17:00 (JST)",
        time: "17:00",
        timezone: "Asia/Tokyo",
      },
      demographics: [
        {
          mal_id: 27,
          name: "Shounen",
          type: "anime",
          url: "https://myanimelist.net/anime/genre/27/Shounen",
        },
      ],
      duration: "24 min per ep",
      episodes: 64,
      explicit_genres: [
        {
          mal_id: 50,
          name: "Adult Cast",
          type: "anime",
          url: "https://myanimelist.net/anime/genre/50/Adult_Cast",
        },
      ],
      favorites: 300000,
      genres: [
        {
          mal_id: 1,
          name: "Action",
          type: "anime",
          url: "https://myanimelist.net/anime/genre/1/Action",
        },
      ],
      images: {
        jpg: {
          image_url: "https://cdn.example/anime/5114.jpg",
          large_image_url: "https://cdn.example/anime/5114-lg.jpg",
          small_image_url: "https://cdn.example/anime/5114-sm.jpg",
        },
        webp: {
          image_url: "https://cdn.example/anime/5114.webp",
          large_image_url: "https://cdn.example/anime/5114.webp",
          small_image_url: "https://cdn.example/anime/5114-sm.webp",
        },
      },
      licensors: [
        {
          mal_id: 200,
          name: "Funimation",
          type: "anime",
          url: "https://myanimelist.net/anime/producer/200",
        },
      ],
      mal_id: malId,
      members: 4000000,
      popularity: 3,
      producers: [
        {
          mal_id: 100,
          name: "Aniplex",
          type: "anime",
          url: "https://myanimelist.net/anime/producer/100",
        },
      ],
      rank: 1,
      rating: "R - 17+ (violence & profanity)",
      relations: [
        {
          entry: [
            {
              mal_id: 121,
              name: "Fullmetal Alchemist: The Sacred Star of Milos",
              type: "anime",
              url: "https://myanimelist.net/anime/121",
            },
          ],
          relation: "Sequel",
        },
      ],
      score: 9.1,
      scored_by: 2300000,
      season: "spring",
      source: "Manga",
      status: "Finished Airing",
      studios: [
        {
          mal_id: 4,
          name: "Bones",
          type: "anime",
          url: "https://myanimelist.net/anime/producer/4",
        },
      ],
      synopsis: "Alchemy meets military thriller.",
      themes: [
        {
          mal_id: 38,
          name: "Military",
          type: "anime",
          url: "https://myanimelist.net/anime/genre/38/Military",
        },
      ],
      title: "Fullmetal Alchemist: Brotherhood",
      title_english: "Fullmetal Alchemist: Brotherhood",
      title_japanese: "鋼の錬金術師 FULLMETAL ALCHEMIST",
      title_synonyms: ["Hagane no Renkinjutsushi: Fullmetal Alchemist"],
      titles: [
        {
          title: "Fullmetal Alchemist: Brotherhood",
          type: "Default",
        },
      ],
      trailer: {
        embed_url: "https://www.youtube.com/embed/abcd1234",
        url: "https://www.youtube.com/watch?v=abcd1234",
        youtube_id: "abcd1234",
      },
      type: "TV",
      url: `https://myanimelist.net/anime/${malId}`,
      year: 2009,
    },
  };
}

function buildSeasonalPayload() {
  return {
    data: [
      {
        aired: {
          from: "2025-04-01T00:00:00+00:00",
          string: "Apr 1, 2025 to Jun 24, 2025",
          to: "2025-06-24T00:00:00+00:00",
        },
        airing: true,
        approved: true,
        demographics: [],
        episodes: 12,
        genres: [
          {
            mal_id: 1,
            name: "Action",
            type: "anime",
            url: "https://myanimelist.net/anime/genre/1/Action",
          },
          {
            mal_id: 8,
            name: "Drama",
            type: "anime",
            url: "https://myanimelist.net/anime/genre/8/Drama",
          },
        ],
        images: {
          jpg: {
            image_url: "https://cdn.example/anime/50001.jpg",
            large_image_url: "https://cdn.example/anime/50001-lg.jpg",
            small_image_url: "https://cdn.example/anime/50001-sm.jpg",
          },
          webp: {
            image_url: "https://cdn.example/anime/50001.webp",
          },
        },
        mal_id: 50001,
        score: 8.5,
        season: "spring",
        status: "Currently Airing",
        title: "Spring Hero",
        title_english: "Spring Hero",
        title_japanese: "春のヒーロー",
        type: "TV",
        url: "https://myanimelist.net/anime/50001",
        year: 2025,
      },
      {
        aired: { from: "2025-04-05T00:00:00+00:00" },
        airing: true,
        genres: [{ mal_id: 10, name: "Fantasy", type: "anime" }],
        images: {},
        mal_id: 50002,
        season: "spring",
        status: "Currently Airing",
        title: "Spring Fantasy",
        type: "TV",
        url: "https://myanimelist.net/anime/50002",
        year: 2025,
      },
    ],
    pagination: {
      has_next_page: true,
      last_visible_page: 2,
    },
  };
}
