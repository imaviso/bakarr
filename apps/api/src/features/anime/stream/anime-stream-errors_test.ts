import { assert, it } from "@effect/vitest";

import {
  EpisodeStreamRangeError,
  EpisodeStreamAccessError,
} from "@/features/anime/stream/anime-stream-errors.ts";

it("EpisodeStreamRangeError has status 416", () => {
  const error = new EpisodeStreamRangeError({
    fileSize: 1024,
    message: "range not satisfiable",
    status: 416 as const,
  });
  assert.deepStrictEqual(error._tag, "EpisodeStreamRangeError");
  assert.deepStrictEqual(error.status, 416);
  assert.deepStrictEqual(error.fileSize, 1024);
});

it("EpisodeStreamAccessError supports valid status codes", () => {
  const e400 = new EpisodeStreamAccessError({ message: "bad request", status: 400 });
  assert.deepStrictEqual(e400.status, 400);

  const e403 = new EpisodeStreamAccessError({ message: "forbidden", status: 403 });
  assert.deepStrictEqual(e403.status, 403);

  const e404 = new EpisodeStreamAccessError({ message: "missing", status: 404 });
  assert.deepStrictEqual(e404.status, 404);
});

it("EpisodeStreamAccessError supports optional cause", () => {
  const err = new EpisodeStreamAccessError({ cause: new Error("io"), message: "bad", status: 404 });
  assert.deepStrictEqual(err.status, 404);
});
