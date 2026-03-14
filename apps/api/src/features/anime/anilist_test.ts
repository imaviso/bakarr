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
                    coverImage: { extraLarge: "https://example.com/cover.png" },
                    episodes: 24,
                    format: "TV",
                    id: 777,
                    status: "RELEASING",
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
                    startDate: { day: 2, month: 1, year: 2024 },
                    status: "FINISHED",
                    studios: { nodes: [{ name: "Studio Remote" }] },
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
      cover_image: "https://example.com/cover.png",
      episode_count: 24,
      format: "TV",
      id: 777,
      status: "RELEASING",
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
    episodeCount: 12,
    format: "TV",
    genres: ["Action"],
    id: 321,
    malId: 654,
    score: 88,
    startDate: "2024-01-02",
    status: "FINISHED",
    studios: ["Studio Remote"],
    title: {
      english: "Remote Detail",
      native: "Remote Detail Native",
      romaji: "Remote Detail",
    },
  };
}
