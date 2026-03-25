import { assertEquals, it } from "../../test/vitest.ts";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Either, Layer } from "effect";

import { ExternalCallError } from "../../lib/effect-retry.ts";
import { SeaDexClient, SeaDexClientLive } from "./seadex-client.ts";

it.effect("SeaDexClient fetches and decodes entry by AniList ID", () =>
  Effect.gen(function* () {
    const result = yield* Effect.flatMap(
      SeaDexClient,
      (client) => client.getEntryByAniListId(20),
    ).pipe(
      Effect.provide(makeSeaDexLayer({
        items: [{
          alID: 20,
          comparison: "https://releases.moe/compare/naruto",
          expand: {
            trs: [{
              dualAudio: true,
              groupedUrl: "https://releases.moe/collections/naruto",
              infoHash: "abcdef0123456789abcdef0123456789abcdef01",
              isBest: true,
              releaseGroup: "SubsPlease",
              tags: ["Best", "Dual Audio"],
              tracker: "Nyaa",
              url: "https://nyaa.si/view/123456",
            }],
          },
          incomplete: false,
          notes: "Recommended release",
        }],
      })),
    );

    assertEquals(
      result
        ? { ...result, releases: result.releases.map((r) => ({ ...r })) }
        : result,
      {
        alID: 20,
        comparison: "https://releases.moe/compare/naruto",
        incomplete: false,
        notes: "Recommended release",
        releases: [{
          dualAudio: true,
          groupedUrl: "https://releases.moe/collections/naruto",
          infoHash: "abcdef0123456789abcdef0123456789abcdef01",
          isBest: true,
          releaseGroup: "SubsPlease",
          tags: ["Best", "Dual Audio"],
          tracker: "Nyaa",
          url: "https://nyaa.si/view/123456",
        }],
      },
    );
  })
);

it.effect("SeaDexClient returns null when entry is missing", () =>
  Effect.gen(function* () {
    const result = yield* Effect.flatMap(
      SeaDexClient,
      (client) => client.getEntryByAniListId(999),
    ).pipe(Effect.provide(makeSeaDexLayer({ items: [] })));

    assertEquals(result, null);
  })
);

it.effect("SeaDexClient wraps schema mismatches as ExternalCallError", () =>
  Effect.gen(function* () {
    const result = yield* Effect.flatMap(
      SeaDexClient,
      (client) => client.getEntryByAniListId(20),
    ).pipe(
      Effect.either,
      Effect.provide(makeSeaDexLayer({
        items: [{
          alID: 20,
          comparison: "https://releases.moe/compare/naruto",
          expand: { trs: [{ isBest: true }] },
          incomplete: false,
          notes: "Broken entry",
        }],
      })),
    );

    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left instanceof ExternalCallError, true);
      assertEquals(result.left.message, "SeaDex response decode failed");
    }
  })
);

function makeSeaDexLayer(payload: unknown) {
  return SeaDexClientLive.pipe(
    Layer.provide(
      Layer.succeed(HttpClient.HttpClient, makeSeaDexHttpClient(payload)),
    ),
  );
}

function makeSeaDexHttpClient(payload: unknown) {
  return HttpClient.make((request, url) => {
    assertEquals(url.pathname, "/api/collections/entries/records");

    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(payload), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
  });
}
