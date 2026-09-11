import { gzipSync } from "node:zlib";
import { utimes } from "node:fs/promises";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { assert, it } from "@effect/vitest";
import { Cache, Effect, Layer } from "effect";
import * as TestClock from "effect/testing/TestClock";

import { ExternalCall, ExternalCallLive } from "@/infra/effect/retry.ts";
import {
  makeTitlesDumpCache,
  parseAnimeTitlesDump,
  prepareAnimeTitlesDump,
  resolveAidFromDumpTitles,
  titlesDumpPathForImagesPath,
} from "@/features/media/metadata/anidb-titles-dump.ts";
import type { AniDbTitleCandidate } from "@/features/media/metadata/anidb-protocol.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";

// Real dump block for aid 17709 (Slime S3), verified against the live dump.
const SLIME_DUMP = [
  "17709|4|de|Meine Wiedergeburt als Schleim in einer anderen Welt Staffel 3",
  "17709|1|x-jat|Tensei Shitara Slime Datta Ken (2024)",
  "17709|2|x-jat|Tensei Shitara Slime Datta Ken 3rd Season",
  "17709|2|x-jat|Tensei Shitara Slime Datta Ken Season 3",
  "17709|3|x-jat|TenSura 3",
  "17709|3|x-jat|tensura s3",
  "17709|4|en|That Time I Got Reincarnated as a Slime (2024)",
  "17709|2|ru|О моём перерождении в слизь 3",
].join("\n");

const DUMP_FIXTURE = [
  "# anime-titles.dat",
  "# <aid>|<type>|<language>|<title>",
  "not-a-row",
  "12|2|x-jat|",
  "abc|2|x-jat|Broken Aid",
  SLIME_DUMP,
  "99999|1|x-jat|TenSura 3",
  "4242|1|x-jat|Some pipe | title",
].join("\n");

function candidate(source: AniDbTitleCandidate["source"], value: string): AniDbTitleCandidate {
  return { source, value };
}

it("parseAnimeTitlesDump skips comments and malformed rows", () => {
  const titles = parseAnimeTitlesDump(DUMP_FIXTURE);
  const aids = titles.map((title) => title.aid);

  assert.deepStrictEqual(aids.includes(17709), true);
  assert.deepStrictEqual(
    titles.every((title) => title.title.length > 0),
    true,
  );
  assert.deepStrictEqual(titles.find((title) => title.aid === 4242)?.title, "Some pipe | title");
});

it("resolveAidFromDumpTitles matches MAL-style romaji against AniDB aliases", () => {
  const titles = prepareAnimeTitlesDump(parseAnimeTitlesDump(DUMP_FIXTURE));

  const match = resolveAidFromDumpTitles(titles, [
    candidate("romaji", "Tensei shitara Slime Datta Ken 3rd Season"),
    candidate("english", "That Time I Got Reincarnated as a Slime Season 3"),
    candidate("synonym", "Tensura 3"),
  ]);

  assert.deepStrictEqual(match?.aid, 17709);
  // Romaji exact (case-insensitive) outscores the short-title hit.
  assert.deepStrictEqual(match?.score, 100);
});

it("resolveAidFromDumpTitles matches english main titles", () => {
  const titles = prepareAnimeTitlesDump(parseAnimeTitlesDump(DUMP_FIXTURE));

  const match = resolveAidFromDumpTitles(titles, [
    candidate("english", "That Time I Got Reincarnated as a Slime (2024)"),
  ]);

  assert.deepStrictEqual(match?.aid, 17709);
});

it("resolveAidFromDumpTitles prefers primary titles on cross-aid ties", () => {
  const titles = prepareAnimeTitlesDump(parseAnimeTitlesDump(DUMP_FIXTURE));

  const match = resolveAidFromDumpTitles(titles, [candidate("synonym", "TenSura 3")]);

  // "TenSura 3" is a short title on 17709 but a primary title on 99999.
  assert.deepStrictEqual(match?.aid, 99999);
});

it("resolveAidFromDumpTitles returns nothing useful for unknown titles", () => {
  const titles = prepareAnimeTitlesDump(parseAnimeTitlesDump(DUMP_FIXTURE));

  const match = resolveAidFromDumpTitles(titles, [
    candidate("romaji", "Nonexistent Anime Title Xyz"),
  ]);

  assert.deepStrictEqual(match === undefined || match.score < 70, true);
});

it("resolveAidFromDumpTitles handles empty inputs", () => {
  const titles = prepareAnimeTitlesDump(parseAnimeTitlesDump(DUMP_FIXTURE));

  assert.deepStrictEqual(
    resolveAidFromDumpTitles(prepareAnimeTitlesDump([]), [candidate("romaji", "x")]),
    undefined,
  );
  assert.deepStrictEqual(resolveAidFromDumpTitles(titles, []), undefined);
});

it("titlesDumpPathForImagesPath co-locates the dump with the image cache", () => {
  assert.deepStrictEqual(
    titlesDumpPathForImagesPath("./data/images"),
    "data/anidb-anime-titles.dat.gz",
  );
  assert.deepStrictEqual(
    titlesDumpPathForImagesPath("/var/lib/bakarr/images/"),
    "/var/lib/bakarr/anidb-anime-titles.dat.gz",
  );
});

it.effect("dump cache downloads when missing and parses", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const path = `${root}/anidb-anime-titles.dat.gz`;
      const gzipped = gzipSync(Buffer.from(SLIME_DUMP, "utf-8"));
      let downloads = 0;

      const layer = Layer.mergeAll(
        ExternalCallLive,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request, _url, _signal, _fiber) =>
            Effect.sync(() => {
              downloads += 1;
              return HttpClientResponse.fromWeb(
                request,
                new Response(gzipped, {
                  headers: { "content-type": "application/gzip" },
                  status: 200,
                }),
              );
            }),
          ),
        ),
      );

      const titles = yield* Effect.gen(function* () {
        const cache = yield* makeTitlesDumpCache({
          client: yield* HttpClient.HttpClient,
          externalCall: yield* ExternalCall,
          fs,
        });
        return yield* Cache.get(cache, path);
      }).pipe(Effect.provide(layer));

      assert.deepStrictEqual(
        titles.titles.some((title) => title.aid === 17709),
        true,
      );

      const match = resolveAidFromDumpTitles(titles, [
        candidate("romaji", "Tensei shitara Slime Datta Ken 3rd Season"),
      ]);
      assert.deepStrictEqual(match?.aid, 17709);
    }),
  ),
);

it.effect("dump cache serves fresh files without downloading", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const path = `${root}/anidb-anime-titles.dat.gz`;
      yield* fs.writeFile(path, gzipSync(Buffer.from(SLIME_DUMP, "utf-8")));
      yield* TestClock.setTime(Date.now());
      let downloads = 0;

      const layer = Layer.mergeAll(
        ExternalCallLive,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request, _url, _signal, _fiber) =>
            Effect.sync(() => {
              downloads += 1;
              return HttpClientResponse.fromWeb(request, new Response("stale", { status: 200 }));
            }),
          ),
        ),
      );

      const titles = yield* Effect.gen(function* () {
        const cache = yield* makeTitlesDumpCache({
          client: yield* HttpClient.HttpClient,
          externalCall: yield* ExternalCall,
          fs,
        });
        return yield* Cache.get(cache, path);
      }).pipe(Effect.provide(layer));

      assert.deepStrictEqual(downloads, 0);
      assert.deepStrictEqual(
        titles.titles.some((title) => title.aid === 17709),
        true,
      );
    }),
  ),
);

it.effect("dump cache refetches stale files", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const path = `${root}/anidb-anime-titles.dat.gz`;
      yield* TestClock.setTime(Date.now());
      yield* fs.writeFile(path, gzipSync(Buffer.from("4242|1|x-jat|Stale Title", "utf-8")));
      // Backdate past the once-per-day policy.
      yield* Effect.promise(() => utimes(path, new Date(0), new Date(0)));
      let downloads = 0;

      const layer = Layer.mergeAll(
        ExternalCallLive,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request, _url, _signal, _fiber) =>
            Effect.sync(() => {
              downloads += 1;
              return HttpClientResponse.fromWeb(
                request,
                new Response(gzipSync(Buffer.from(SLIME_DUMP, "utf-8")), {
                  headers: { "content-type": "application/gzip" },
                  status: 200,
                }),
              );
            }),
          ),
        ),
      );

      const titles = yield* Effect.gen(function* () {
        const cache = yield* makeTitlesDumpCache({
          client: yield* HttpClient.HttpClient,
          externalCall: yield* ExternalCall,
          fs,
        });
        return yield* Cache.get(cache, path);
      }).pipe(Effect.provide(layer));

      assert.deepStrictEqual(downloads, 1);
      assert.deepStrictEqual(
        titles.titles.some((title) => title.aid === 17709),
        true,
      );
      assert.deepStrictEqual(
        titles.titles.some((title) => title.aid === 4242),
        false,
      );
    }),
  ),
);

it.effect("dump cache dedupes concurrent cold loads into one download", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const path = `${root}/anidb-anime-titles.dat.gz`;
      let downloads = 0;

      const layer = Layer.mergeAll(
        ExternalCallLive,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request, _url, _signal, _fiber) =>
            Effect.sync(() => {
              downloads += 1;
              return HttpClientResponse.fromWeb(
                request,
                new Response(gzipSync(Buffer.from(SLIME_DUMP, "utf-8")), {
                  headers: { "content-type": "application/gzip" },
                  status: 200,
                }),
              );
            }),
          ),
        ),
      );

      const [first, second] = yield* Effect.gen(function* () {
        // One shared cache across both fibers: a single in-flight lookup.
        const cache = yield* makeTitlesDumpCache({
          client: yield* HttpClient.HttpClient,
          externalCall: yield* ExternalCall,
          fs,
        });
        return yield* Effect.all([Cache.get(cache, path), Cache.get(cache, path)], {
          concurrency: 2,
        });
      }).pipe(Effect.provide(layer));

      assert.deepStrictEqual(downloads, 1);
      assert.deepStrictEqual(
        first.titles.some((title) => title.aid === 17709),
        true,
      );
      assert.deepStrictEqual(
        second.titles.some((title) => title.aid === 17709),
        true,
      );
    }),
  ),
);

it.effect("dump cache keeps stale file when the download is garbage", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const path = `${root}/anidb-anime-titles.dat.gz`;
      yield* TestClock.setTime(Date.now());
      yield* fs.writeFile(path, gzipSync(Buffer.from(SLIME_DUMP, "utf-8")));
      yield* Effect.promise(() => utimes(path, new Date(0), new Date(0)));

      const layer = Layer.mergeAll(
        ExternalCallLive,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request, _url, _signal, _fiber) =>
            Effect.sync(() =>
              HttpClientResponse.fromWeb(
                request,
                new Response(new TextEncoder().encode("not a gzip payload"), {
                  headers: { "content-type": "application/gzip" },
                  status: 200,
                }),
              ),
            ),
          ),
        ),
      );

      const titles = yield* Effect.gen(function* () {
        const cache = yield* makeTitlesDumpCache({
          client: yield* HttpClient.HttpClient,
          externalCall: yield* ExternalCall,
          fs,
        });
        return yield* Cache.get(cache, path);
      }).pipe(Effect.provide(layer));

      // Stale content served; the garbage was never persisted over it.
      assert.deepStrictEqual(
        titles.titles.some((title) => title.aid === 17709),
        true,
      );
    }),
  ),
);

it.effect("dump cache refuses oversized downloads", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const path = `${root}/anidb-anime-titles.dat.gz`;

      const layer = Layer.mergeAll(
        ExternalCallLive,
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request, _url, _signal, _fiber) =>
            Effect.sync(() =>
              HttpClientResponse.fromWeb(
                request,
                new Response("too big", {
                  headers: {
                    "content-length": "99999999999",
                    "content-type": "application/gzip",
                  },
                  status: 200,
                }),
              ),
            ),
          ),
        ),
      );

      const titles = yield* Effect.gen(function* () {
        const cache = yield* makeTitlesDumpCache({
          client: yield* HttpClient.HttpClient,
          externalCall: yield* ExternalCall,
          fs,
        });
        return yield* Cache.get(cache, path);
      }).pipe(Effect.provide(layer));

      assert.deepStrictEqual(titles.titles, []);
      assert.deepStrictEqual(
        resolveAidFromDumpTitles(titles, [candidate("romaji", "Sousou no Frieren")]),
        undefined,
      );
    }),
  ),
);
