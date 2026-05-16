import { HttpClient, HttpClientResponse } from "@effect/platform";
import { assert, it } from "@effect/vitest";
import { Effect, Either, Layer, Option, Schema } from "effect";

import { AppConfig } from "@/config/schema.ts";
import {
  MANAMI_CACHE_DIR_NAME,
  MANAMI_CACHE_DATASET_FILE,
  MANAMI_CACHE_META_FILE,
  MANAMI_CACHE_REFRESH_INTERVAL_MS,
  MANAMI_CACHE_SQLITE_FILE,
  ManamiClient,
  ManamiClientLive,
} from "@/features/anime/metadata/manami.ts";
import { ManamiDatasetSchema } from "@/features/anime/metadata/manami-model.ts";
import {
  parseAniListIdFromSource,
  parseMalIdFromSource,
} from "@/features/anime/metadata/manami-url.ts";
import { ClockService, ClockServiceLive } from "@/infra/clock.ts";
import { ExternalCallError, ExternalCallLive } from "@/infra/effect/retry.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { withFileSystemSandboxEffect } from "@/test/filesystem-test.ts";

const textEncoder = new TextEncoder();

it("manami source URL parsing extracts AniList and MAL ids", () => {
  assert.deepStrictEqual(
    parseAniListIdFromSource("https://anilist.co/anime/16498/Shingeki-no-Kyojin"),
    16498,
  );
  assert.deepStrictEqual(
    parseAniListIdFromSource("https://www.anilist.co/anime/5114?source=sync"),
    5114,
  );
  assert.deepStrictEqual(
    parseAniListIdFromSource("https://myanimelist.net/anime/5114/Fullmetal_Alchemist"),
    undefined,
  );

  assert.deepStrictEqual(
    parseMalIdFromSource("https://myanimelist.net/anime/5114/Fullmetal_Alchemist"),
    5114,
  );
  assert.deepStrictEqual(parseMalIdFromSource("https://myanimelist.net/anime.php?id=9253"), 9253);
  assert.deepStrictEqual(parseMalIdFromSource("https://anilist.co/anime/5114"), undefined);
});

it.scoped("ManamiClient maps non-2xx response as ExternalCallError with response operation", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const clientLayer = makeManamiClientLayer({
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() =>
            HttpClientResponse.fromWeb(
              request,
              Response.json({ message: "bad gateway" }, { status: 502 }),
            ),
          ),
        ),
        root,
      });

      const result = yield* Effect.flatMap(ManamiClient, (client) =>
        client.getByAniListId(1001),
      ).pipe(Effect.provide(clientLayer), Effect.either);

      assert.ok(Either.isLeft(result));
      assert.ok(result.left instanceof ExternalCallError);
      assert.deepStrictEqual(result.left.operation, "manami.dataset.response");
    }),
  ),
);

it.scoped("ManamiClient maps decode failures as ExternalCallError with json operation", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const clientLayer = makeManamiClientLayer({
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() =>
            HttpClientResponse.fromWeb(
              request,
              Response.json(
                {
                  data: "invalid",
                  lastUpdate: "2026-01-02",
                  license: {
                    name: "Open Data Commons Open Database License (ODbL) v1.0 + Database Contents License (DbCL) v1.0",
                    url: "https://github.com/manami-project/anime-offline-database/blob/2026-14/LICENSE",
                  },
                  repository: "https://github.com/manami-project/anime-offline-database",
                },
                { status: 200 },
              ),
            ),
          ),
        ),
        root,
      });

      const result = yield* Effect.flatMap(ManamiClient, (client) =>
        client.getByAniListId(1001),
      ).pipe(Effect.provide(clientLayer), Effect.either);

      assert.ok(Either.isLeft(result));
      assert.ok(result.left instanceof ExternalCallError);
      assert.deepStrictEqual(result.left.operation, "manami.dataset.json");
    }),
  ),
);

it.scoped("ManamiClient downloads once and serves sqlite lookups", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      let requestCount = 0;
      const clientLayer = makeManamiClientLayer({
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() => {
            requestCount += 1;
            return HttpClientResponse.fromWeb(
              request,
              Response.json(SYNTHETIC_DATASET, { status: 200 }),
            );
          }),
        ),
        root,
      });

      const result = yield* Effect.flatMap(ManamiClient, (client) =>
        Effect.gen(function* () {
          const concurrent = yield* Effect.all(
            [
              client.getByAniListId(1001),
              client.getByMalId(3003),
              client.resolveMalIdFromAniListId(1003),
              client.resolveAniListIdFromMalId(3001),
            ],
            { concurrency: "unbounded" },
          );
          const secondLookup = yield* client.getByAniListId(1003);

          return { concurrent, secondLookup } as const;
        }),
      ).pipe(Effect.provide(clientLayer));

      const [byAniList, byMal, malFromAniList, aniListFromMal] = result.concurrent;

      assert.deepStrictEqual(Option.isSome(byAniList), true);
      assert.deepStrictEqual(Option.isSome(byMal), true);
      assert.deepStrictEqual(
        byAniList.pipe(Option.map((entry) => entry.title)),
        Option.some("Alpha"),
      );
      assert.deepStrictEqual(byMal.pipe(Option.map((entry) => entry.title)), Option.some("Gamma"));
      assert.deepStrictEqual(malFromAniList, Option.some(3003));
      assert.deepStrictEqual(aniListFromMal, Option.some(1001));
      assert.deepStrictEqual(
        result.secondLookup.pipe(Option.map((entry) => entry.title)),
        Option.some("Gamma"),
      );
      assert.deepStrictEqual(requestCount, 1);
    }),
  ),
);

it.scoped("ManamiClient searches cached titles and synonyms", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      let requestCount = 0;
      const clientLayer = makeManamiClientLayer({
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() => {
            requestCount += 1;
            return HttpClientResponse.fromWeb(
              request,
              Response.json(SYNTHETIC_DATASET, { status: 200 }),
            );
          }),
        ),
        root,
      });

      const results = yield* Effect.flatMap(ManamiClient, (client) =>
        client.searchAnime("Alpha Alias", 10),
      ).pipe(Effect.provide(clientLayer));

      assert.deepStrictEqual(
        results.map((result) => result.id),
        [1001],
      );
      assert.deepStrictEqual(results[0]?.title.romaji, "Alpha");
      assert.deepStrictEqual(results[0]?.title.english, "Alpha");
      assert.deepStrictEqual(results[0]?.synonyms, ["Alpha Alias"]);
      assert.deepStrictEqual(results[0]?.already_in_library, false);
      assert.deepStrictEqual(requestCount, 1);
    }),
  ),
);

it.scoped("ManamiClient reuses sqlite cache across layer restarts", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      let firstRunRequests = 0;

      const initialLayer = makeManamiClientLayer({
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() => {
            firstRunRequests += 1;
            return HttpClientResponse.fromWeb(
              request,
              Response.json(SYNTHETIC_DATASET, { status: 200 }),
            );
          }),
        ),
        root,
      });

      const firstResult = yield* Effect.flatMap(ManamiClient, (client) =>
        client.getByAniListId(1001),
      ).pipe(Effect.provide(initialLayer));

      let secondRunRequests = 0;
      const restartedLayer = makeManamiClientLayer({
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() => {
            secondRunRequests += 1;
            return HttpClientResponse.fromWeb(
              request,
              Response.json({ message: "network should not be used" }, { status: 502 }),
            );
          }),
        ),
        root,
      });

      const secondResult = yield* Effect.flatMap(ManamiClient, (client) =>
        client.getByAniListId(1001),
      ).pipe(Effect.provide(restartedLayer));

      assert.deepStrictEqual(
        firstResult.pipe(Option.map((entry) => entry.title)),
        Option.some("Alpha"),
      );
      assert.deepStrictEqual(
        secondResult.pipe(Option.map((entry) => entry.title)),
        Option.some("Alpha"),
      );
      assert.deepStrictEqual(firstRunRequests, 1);
      assert.deepStrictEqual(secondRunRequests, 0);
    }),
  ),
);

it.scoped("ManamiClient rebuilds invalid sqlite cache from local dataset", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const clockNow = MANAMI_CACHE_REFRESH_INTERVAL_MS / 2;
      yield* writeCachedDataset(fs, root, SYNTHETIC_DATASET, clockNow - 1);
      const cacheDir = `${root}/${MANAMI_CACHE_DIR_NAME}`;
      yield* fs.writeFile(`${cacheDir}/${MANAMI_CACHE_SQLITE_FILE}`, new Uint8Array());

      let requestCount = 0;
      const clientLayer = makeManamiClientLayer({
        clockLayer: Layer.succeed(ClockService, {
          currentMonotonicMillis: Effect.succeed(clockNow),
          currentTimeMillis: Effect.succeed(clockNow),
        }),
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() => {
            requestCount += 1;
            return HttpClientResponse.fromWeb(
              request,
              Response.json({ message: "network should not be used" }, { status: 502 }),
            );
          }),
        ),
        root,
      });

      const result = yield* Effect.flatMap(ManamiClient, (client) =>
        client.getByAniListId(1001),
      ).pipe(Effect.provide(clientLayer));

      assert.deepStrictEqual(result.pipe(Option.map((entry) => entry.title)), Option.some("Alpha"));
      assert.deepStrictEqual(requestCount, 0);
    }),
  ),
);

it.scoped("ManamiClient fills duplicate cross-id links while keeping first title rows", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      let requestCount = 0;
      const clientLayer = makeManamiClientLayer({
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() => {
            requestCount += 1;
            return HttpClientResponse.fromWeb(
              request,
              Response.json(DUPLICATE_LINK_DATASET, { status: 200 }),
            );
          }),
        ),
        root,
      });

      const result = yield* Effect.flatMap(ManamiClient, (client) =>
        Effect.all(
          [
            client.resolveMalIdFromAniListId(5001),
            client.resolveAniListIdFromMalId(9002),
            client.getByMalId(9001),
            client.getByMalId(9002),
          ],
          { concurrency: "unbounded" },
        ),
      ).pipe(Effect.provide(clientLayer));

      const [malFromAniList, aniListFromMal, firstMalLookup, secondMalLookup] = result;

      assert.deepStrictEqual(malFromAniList, Option.some(9001));
      assert.deepStrictEqual(aniListFromMal, Option.some(5002));
      assert.deepStrictEqual(
        firstMalLookup.pipe(Option.map((entry) => entry.title)),
        Option.some("First AniList"),
      );
      assert.deepStrictEqual(
        secondMalLookup.pipe(Option.map((entry) => entry.title)),
        Option.some("Second AniList"),
      );
      assert.deepStrictEqual(requestCount, 1);
    }),
  ),
);

it.scoped("ManamiClient refreshes stale sqlite cache", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      const staleDataset = {
        ...SYNTHETIC_DATASET,
        data: [
          {
            sources: ["https://anilist.co/anime/1001/Old-Title"],
            title: "Old Title",
          },
        ],
      };
      const staleFetchedAt = 0;
      yield* writeCachedDataset(fs, root, staleDataset, staleFetchedAt);

      const clockNow = MANAMI_CACHE_REFRESH_INTERVAL_MS * 2;
      let requestCount = 0;
      const clientLayer = makeManamiClientLayer({
        clockLayer: Layer.succeed(ClockService, {
          currentMonotonicMillis: Effect.succeed(clockNow),
          currentTimeMillis: Effect.succeed(clockNow),
        }),
        fs,
        httpClient: HttpClient.make((request) =>
          Effect.sync(() => {
            requestCount += 1;
            return HttpClientResponse.fromWeb(
              request,
              Response.json(SYNTHETIC_DATASET, { status: 200 }),
            );
          }),
        ),
        root,
      });

      const result = yield* Effect.flatMap(ManamiClient, (client) =>
        client.getByAniListId(1001),
      ).pipe(Effect.provide(clientLayer));

      assert.deepStrictEqual(result.pipe(Option.map((entry) => entry.title)), Option.some("Alpha"));
      assert.deepStrictEqual(requestCount, 1);
    }),
  ),
);

function makeManamiClientLayer(input: {
  readonly clockLayer?: Layer.Layer<ClockService>;
  readonly fs: FileSystemShape;
  readonly httpClient: HttpClient.HttpClient;
  readonly root: string;
}) {
  const clockLayer = input.clockLayer ?? ClockServiceLive;
  const externalCallLayer = ExternalCallLive.pipe(Layer.provide(clockLayer));

  return ManamiClientLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        AppConfig.layer({ databaseFile: `${input.root}/bakarr.sqlite` }),
        clockLayer,
        externalCallLayer,
        Layer.succeed(FileSystem, input.fs),
        Layer.succeed(HttpClient.HttpClient, input.httpClient),
      ),
    ),
  );
}

const writeCachedDataset = Effect.fn("Test.writeCachedDataset")(function* (
  fs: FileSystemShape,
  root: string,
  dataset: Schema.Schema.Type<typeof ManamiDatasetSchema>,
  fetchedAtMs: number,
) {
  const datasetJson = yield* Schema.encode(Schema.parseJson(ManamiDatasetSchema))(dataset);
  const metaJson = yield* Schema.encode(
    Schema.parseJson(
      Schema.Struct({
        fetchedAtMs: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
      }),
    ),
  )({ fetchedAtMs });
  const cacheDir = `${root}/${MANAMI_CACHE_DIR_NAME}`;
  yield* fs.mkdir(cacheDir, { recursive: true });
  yield* fs.writeFile(`${cacheDir}/${MANAMI_CACHE_DATASET_FILE}`, textEncoder.encode(datasetJson));
  yield* fs.writeFile(`${cacheDir}/${MANAMI_CACHE_META_FILE}`, textEncoder.encode(metaJson));
});

const SYNTHETIC_DATASET = {
  data: [
    {
      relatedAnime: ["https://anilist.co/anime/1003"],
      sources: ["https://anilist.co/anime/1001/Alpha", "https://myanimelist.net/anime/3001/Alpha"],
      studios: ["Studio A"],
      synonyms: ["Alpha Alias"],
      tags: ["Action"],
      title: "Alpha",
    },
    {
      relatedAnime: [],
      sources: ["https://anilist.co/anime/1002/Beta"],
      studios: ["Studio B"],
      synonyms: ["Beta Alias"],
      tags: ["Drama"],
      title: "Beta",
    },
    {
      relatedAnime: ["https://myanimelist.net/anime/3001/Alpha"],
      sources: [
        "https://myanimelist.net/anime.php?id=3003",
        "https://www.anilist.co/anime/1003/Gamma?src=import",
      ],
      studios: ["Studio C"],
      synonyms: ["Gamma Alias"],
      tags: ["Sci-Fi"],
      title: "Gamma",
    },
  ],
  lastUpdate: "2026-01-02",
  license: {
    name: "Open Data Commons Open Database License (ODbL) v1.0 + Database Contents License (DbCL) v1.0",
    url: "https://github.com/manami-project/anime-offline-database/blob/2026-14/LICENSE",
  },
  repository: "https://github.com/manami-project/anime-offline-database",
};

const DUPLICATE_LINK_DATASET = {
  data: [
    {
      sources: ["https://anilist.co/anime/5001/First-AniList"],
      title: "First AniList",
    },
    {
      sources: [
        "https://anilist.co/anime/5001/Second-AniList",
        "https://myanimelist.net/anime/9001/Second-AniList",
      ],
      title: "Second AniList",
    },
    {
      sources: ["https://myanimelist.net/anime/9002/Mal-Only-First"],
      title: "MAL Only First",
    },
    {
      sources: [
        "https://anilist.co/anime/5002/Second-AniList",
        "https://myanimelist.net/anime/9002/Second-AniList",
      ],
      title: "Second AniList",
    },
  ],
  lastUpdate: "2026-01-02",
  license: {
    name: "Open Data Commons Open Database License (ODbL) v1.0 + Database Contents License (DbCL) v1.0",
    url: "https://github.com/manami-project/anime-offline-database/blob/2026-14/LICENSE",
  },
  repository: "https://github.com/manami-project/anime-offline-database",
};
