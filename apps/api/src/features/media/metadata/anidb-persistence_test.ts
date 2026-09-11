import { assert, it } from "@effect/vitest";

import { buildAnimeCommand, decideAidPersistence } from "@/features/media/metadata/anidb.ts";

it("builds ANIME commands with spec escaping and no percent-encoding", () => {
  assert.deepStrictEqual(
    buildAnimeCommand({ source: "romaji", value: "Sousou no Frieren" }, "tok"),
    "ANIME aname=Sousou no Frieren&s=tok",
  );
  assert.deepStrictEqual(
    buildAnimeCommand({ source: "english", value: "Ash & Pikachu" }, "tok"),
    "ANIME aname=Ash &amp; Pikachu&s=tok",
  );
});

it("keeps map hits that yield episodes", () => {
  assert.deepStrictEqual(
    decideAidPersistence({
      countKnown: true,
      fetchedCount: 24,
      mapHit: true,
      requestedCount: 24,
      sawEpisodeResponse: true,
      strong: true,
    }),
    "keep",
  );
});

it("drops map hits with no healthy episode reply", () => {
  assert.deepStrictEqual(
    decideAidPersistence({
      countKnown: true,
      fetchedCount: 0,
      mapHit: true,
      requestedCount: 24,
      sawEpisodeResponse: false,
      strong: true,
    }),
    "delete",
  );
});

it("never stores weak title matches", () => {
  assert.deepStrictEqual(
    decideAidPersistence({
      countKnown: true,
      fetchedCount: 24,
      mapHit: false,
      requestedCount: 24,
      sawEpisodeResponse: true,
      strong: false,
    }),
    "ephemeral",
  );
});

it("stores strong matches confirmed by a full fetch", () => {
  assert.deepStrictEqual(
    decideAidPersistence({
      countKnown: true,
      fetchedCount: 24,
      mapHit: false,
      requestedCount: 24,
      sawEpisodeResponse: true,
      strong: true,
    }),
    "store",
  );
});

it("holds back strong matches on episode shortfall when the count is known", () => {
  assert.deepStrictEqual(
    decideAidPersistence({
      countKnown: true,
      fetchedCount: 12,
      mapHit: false,
      requestedCount: 24,
      sawEpisodeResponse: true,
      strong: true,
    }),
    "ephemeral",
  );
});

it("stores strong matches when the count is unknown", () => {
  assert.deepStrictEqual(
    decideAidPersistence({
      countKnown: false,
      fetchedCount: 12,
      mapHit: false,
      requestedCount: 200,
      sawEpisodeResponse: true,
      strong: true,
    }),
    "store",
  );
});

it("keeps map hits with healthy replies but zero regular episodes", () => {
  assert.deepStrictEqual(
    decideAidPersistence({
      countKnown: true,
      fetchedCount: 0,
      mapHit: true,
      requestedCount: 24,
      sawEpisodeResponse: true,
      strong: true,
    }),
    "keep",
  );
});
