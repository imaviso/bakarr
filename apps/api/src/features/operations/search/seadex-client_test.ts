import { assert, it } from "@effect/vitest";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import { Effect, Either, Layer, Option } from "effect";

import { ClockServiceLive } from "@/infra/clock.ts";
import { ExternalCallError, ExternalCallLive } from "@/infra/effect/retry.ts";
import { SeaDexClient, SeaDexClientLive } from "@/features/operations/search/seadex-client.ts";

const ExternalCallTestLayer = ExternalCallLive.pipe(Layer.provide(ClockServiceLive));

it.effect("SeaDexClient fetches and decodes entry by AniList ID", () =>
  Effect.gen(function* () {
    const result = yield* Effect.flatMap(SeaDexClient, (client) =>
      client.getEntryByAniListId(20),
    ).pipe(
      Effect.provide(
        makeSeaDexLayer({
          items: [
            {
              alID: 20,
              comparison: "https://releases.moe/compare/naruto",
              expand: {
                trs: [
                  {
                    dualAudio: true,
                    groupedUrl: "https://releases.moe/collections/naruto",
                    infoHash: "abcdef0123456789abcdef0123456789abcdef01",
                    isBest: true,
                    releaseGroup: "SubsPlease",
                    tags: ["Best", "Dual Audio"],
                    tracker: "Nyaa",
                    url: "https://nyaa.si/view/123456",
                  },
                ],
              },
              incomplete: false,
              notes: "Recommended release",
            },
          ],
        }),
      ),
    );

    assert.deepStrictEqual(Option.isSome(result), true);
    if (Option.isSome(result)) {
      assert.deepStrictEqual(structuredClone(result.value), expectedEntry());
    }
  }),
);

it.effect("SeaDexClient returns none when entry is missing", () =>
  Effect.gen(function* () {
    const result = yield* Effect.flatMap(SeaDexClient, (client) =>
      client.getEntryByAniListId(999),
    ).pipe(Effect.provide(makeSeaDexLayer({ items: [] })));

    assert.deepStrictEqual(result, Option.none());
  }),
);

it.effect("SeaDexClient wraps schema mismatches as ExternalCallError", () =>
  Effect.gen(function* () {
    const result = yield* Effect.flatMap(SeaDexClient, (client) =>
      client.getEntryByAniListId(20),
    ).pipe(
      Effect.either,
      Effect.provide(
        makeSeaDexLayer({
          items: [
            {
              alID: 20,
              comparison: "https://releases.moe/compare/naruto",
              expand: { trs: [{ isBest: true }] },
              incomplete: false,
              notes: "Broken entry",
            },
          ],
        }),
      ),
    );

    assert.deepStrictEqual(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assert.deepStrictEqual(result.left instanceof ExternalCallError, true);
      assert.deepStrictEqual(result.left.message, "SeaDex response decode failed");
    }
  }),
);

function makeSeaDexLayer(payload: unknown) {
  return SeaDexClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        ClockServiceLive,
        ExternalCallTestLayer,
        Layer.succeed(HttpClient.HttpClient, makeSeaDexHttpClient(payload)),
      ),
    ),
  );
}

function makeSeaDexHttpClient(payload: unknown) {
  return HttpClient.make((request, url) => {
    assert.deepStrictEqual(url.pathname, "/api/collections/entries/records");

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

function expectedEntry() {
  return {
    alID: 20,
    comparison: "https://releases.moe/compare/naruto",
    incomplete: false,
    notes: "Recommended release",
    releases: [
      {
        dualAudio: true,
        groupedUrl: "https://releases.moe/collections/naruto",
        infoHash: "abcdef0123456789abcdef0123456789abcdef01",
        isBest: true,
        releaseGroup: "SubsPlease",
        tags: ["Best", "Dual Audio"],
        tracker: "Nyaa",
        url: "https://nyaa.si/view/123456",
      },
    ],
  };
}
