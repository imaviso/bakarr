import { HttpClient, HttpClientResponse } from "@effect/platform";
import { assert, it } from "@effect/vitest";
import { Effect, Either, Layer, Option } from "effect";

import { JikanClient, JikanClientLive } from "@/features/anime/jikan.ts";
import { ClockServiceLive } from "@/lib/clock.ts";
import { ExternalCallError, ExternalCallLive } from "@/lib/effect-retry.ts";

const ExternalCallTestLayer = ExternalCallLive.pipe(Layer.provide(ClockServiceLive));

it.scoped("JikanClient decodes full payload and normalizes metadata", () =>
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
      assert.deepStrictEqual(result.value.title.romaji, "Fullmetal Alchemist: Brotherhood");
      assert.deepStrictEqual(result.value.title.english, "Fullmetal Alchemist: Brotherhood");
      assert.deepStrictEqual(result.value.title.native, "鋼の錬金術師 FULLMETAL ALCHEMIST");
      assert.deepStrictEqual(result.value.synopsis, "Alchemy meets military thriller.");
      assert.deepStrictEqual(result.value.episodeCount, 64);
      assert.deepStrictEqual(result.value.format, "TV");
      assert.deepStrictEqual(result.value.status, "Finished Airing");
      assert.deepStrictEqual(result.value.startDate, "2009-04-05");
      assert.deepStrictEqual(result.value.endDate, "2010-07-04");
      assert.deepStrictEqual(result.value.score, 9.1);
      assert.deepStrictEqual(result.value.genres, ["Action", "Military", "Shounen"]);
      assert.deepStrictEqual(result.value.studios, ["Bones"]);
      assert.deepStrictEqual(result.value.titleVariants, [
        "Hagane no Renkinjutsushi: Fullmetal Alchemist",
        "Fullmetal Alchemist: Brotherhood",
        "鋼の錬金術師 FULLMETAL ALCHEMIST",
      ]);
      assert.deepStrictEqual(result.value.relations, [
        {
          malId: 121,
          relation: "Sequel",
          title: "Fullmetal Alchemist: The Sacred Star of Milos",
        },
      ]);
    }

    assert.deepStrictEqual(requestCount, 1);
  }),
);

it.scoped("JikanClient falls back to detail payload when full endpoint is missing", () =>
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
                        genres: [{ name: "Adventure" }],
                        mal_id: 21,
                        score: 8.1,
                        status: "Finished Airing",
                        studios: [{ name: "BONES" }],
                        synopsis: "Two brothers seek the Philosopher's Stone.",
                        title: "Fullmetal Alchemist",
                        title_english: "Fullmetal Alchemist",
                        title_japanese: "鋼の錬金術師",
                        title_synonyms: ["Hagane no Renkinjutsushi"],
                        titles: [{ title: "FMA", type: "Synonym" }],
                        type: "TV",
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

    const result = yield* Effect.flatMap(JikanClient, (client) => client.getAnimeByMalId(21)).pipe(
      Effect.provide(clientLayer),
    );

    assert.deepStrictEqual(requests, [
      "https://api.jikan.moe/v4/anime/21/full",
      "https://api.jikan.moe/v4/anime/21",
    ]);
    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.deepStrictEqual(result.value.malId, 21);
      assert.deepStrictEqual(result.value.relations, []);
      assert.deepStrictEqual(result.value.titleVariants, [
        "Hagane no Renkinjutsushi",
        "FMA",
        "Fullmetal Alchemist",
        "鋼の錬金術師",
      ]);
    }
  }),
);

it.scoped("JikanClient accepts nullable optional arrays from full payload", () =>
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
                  new Response(
                    JSON.stringify({
                      data: {
                        aired: null,
                        demographics: null,
                        episodes: null,
                        genres: null,
                        mal_id: 19,
                        relations: null,
                        score: null,
                        status: null,
                        studios: null,
                        synopsis: null,
                        themes: null,
                        title: "Monster",
                        title_english: null,
                        title_japanese: null,
                        title_synonyms: null,
                        titles: null,
                        type: null,
                      },
                    }),
                    {
                      headers: { "content-type": "application/json" },
                      status: 200,
                    },
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    const result = yield* Effect.flatMap(JikanClient, (client) => client.getAnimeByMalId(19)).pipe(
      Effect.provide(clientLayer),
    );

    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.deepStrictEqual(result.value.malId, 19);
      assert.deepStrictEqual(result.value.genres, []);
      assert.deepStrictEqual(result.value.studios, []);
      assert.deepStrictEqual(result.value.relations, []);
      assert.deepStrictEqual(result.value.titleVariants, ["Monster"]);
    }
  }),
);

it.scoped("JikanClient maps full decode failures with jikan detail operation name", () =>
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
                ),
              ),
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
    assert.deepStrictEqual(result.left.operation, "jikan.detail.full.json");
  }),
);

it.scoped("JikanClient maps basic normalize failures with jikan detail operation name", () =>
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
                if (request.url.endsWith("/anime/3/full")) {
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
                        mal_id: 3.5,
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

    const result = yield* Effect.flatMap(JikanClient, (client) => client.getAnimeByMalId(3)).pipe(
      Effect.provide(clientLayer),
      Effect.either,
    );

    assert.ok(Either.isLeft(result));
    assert.ok(result.left instanceof ExternalCallError);
    assert.deepStrictEqual(result.left.operation, "jikan.detail.basic.normalize");
  }),
);

function makeJikanClient(onRequest: () => void) {
  return HttpClient.make((request) =>
    Effect.sync(() => {
      onRequest();

      return HttpClientResponse.fromWeb(
        request,
        new Response(
          JSON.stringify({
            data: {
              aired: {
                from: "2009-04-05T00:00:00+00:00",
                to: "2010-07-04T00:00:00+00:00",
              },
              demographics: [{ name: "Shounen" }],
              episodes: 64,
              genres: [{ name: "Action" }],
              mal_id: 5114,
              relations: [
                {
                  entry: [
                    {
                      mal_id: 121,
                      name: "Fullmetal Alchemist: The Sacred Star of Milos",
                      type: "anime",
                    },
                  ],
                  relation: "Sequel",
                },
              ],
              score: 9.1,
              status: "Finished Airing",
              studios: [{ name: "Bones" }],
              synopsis: "Alchemy meets military thriller.",
              themes: [{ name: "Military" }],
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
              type: "TV",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      );
    }),
  );
}
