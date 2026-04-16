import { HttpClient, HttpClientResponse } from "@effect/platform";
import { assert, it } from "@effect/vitest";
import { Effect, Either, Layer, Option, Schema } from "effect";

import { AppConfig } from "@/config.ts";
import { buildManamiIndexes } from "@/features/anime/manami-index.ts";
import { ManamiDatasetSchema } from "@/features/anime/manami-model.ts";
import {
  MANAMI_CACHE_DATASET_FILE,
  MANAMI_CACHE_DIR_NAME,
  MANAMI_CACHE_META_FILE,
  MANAMI_CACHE_REFRESH_INTERVAL_MS,
  ManamiClient,
  ManamiClientLive,
} from "@/features/anime/manami.ts";
import { parseAniListIdFromSource, parseMalIdFromSource } from "@/features/anime/manami-url.ts";
import { ClockService, ClockServiceLive } from "@/lib/clock.ts";
import { ExternalCallError, ExternalCallLive } from "@/lib/effect-retry.ts";
import { FileSystem, type FileSystemShape } from "@/lib/filesystem.ts";
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

it.effect("manami index construction maps AniList and MAL lookups", () =>
  Effect.gen(function* () {
    const dataset = yield* decodeSyntheticDataset;
    const indexes = buildManamiIndexes(dataset);

    const fromAniList = indexes.byAniListId.get(1001);
    const fromMal = indexes.byMalId.get(3003);

    assert.deepStrictEqual(fromAniList?.title, "Alpha");
    assert.deepStrictEqual(fromMal?.title, "Gamma");
    assert.deepStrictEqual(indexes.malIdByAniListId.get(1002), undefined);
    assert.deepStrictEqual(indexes.malIdByAniListId.get(1003), 3003);
    assert.deepStrictEqual(indexes.aniListIdByMalId.get(3001), 1001);
  }),
);

it.effect("manami index construction keeps first entry for duplicate ids", () =>
  Effect.gen(function* () {
    const dataset = yield* Schema.decodeUnknown(ManamiDatasetSchema)({
      data: [
        {
          sources: [
            "https://anilist.co/anime/5001/First",
            "https://myanimelist.net/anime/9001/First",
          ],
          title: "First",
        },
        {
          sources: [
            "https://anilist.co/anime/5001/Second",
            "https://myanimelist.net/anime/9001/Second",
          ],
          title: "Second",
        },
      ],
      lastUpdate: "2026-01-02",
      license: {
        name: "Open Data Commons Open Database License (ODbL) v1.0 + Database Contents License (DbCL) v1.0",
        url: "https://github.com/manami-project/anime-offline-database/blob/2026-14/LICENSE",
      },
      repository: "https://github.com/manami-project/anime-offline-database",
    });
    const indexes = buildManamiIndexes(dataset);

    assert.deepStrictEqual(indexes.byAniListId.get(5001)?.title, "First");
    assert.deepStrictEqual(indexes.byMalId.get(9001)?.title, "First");
    assert.deepStrictEqual(indexes.malIdByAniListId.get(5001), 9001);
    assert.deepStrictEqual(indexes.aniListIdByMalId.get(9001), 5001);
  }),
);

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

it.scoped("ManamiClient downloads once and serves indexed lookups", () =>
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

it.scoped("ManamiClient reuses parsed indexes while cache is fresh", () =>
  withFileSystemSandboxEffect(({ fs, root }) =>
    Effect.gen(function* () {
      let requestCount = 0;
      let datasetReadCount = 0;
      const countingFs: FileSystemShape = {
        ...fs,
        readFile: (path) => {
          if (typeof path === "string" && path.endsWith(`/${MANAMI_CACHE_DATASET_FILE}`)) {
            datasetReadCount += 1;
          }

          return fs.readFile(path);
        },
      };
      const clientLayer = makeManamiClientLayer({
        fs: countingFs,
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
          const first = yield* client.getByAniListId(1001);
          const second = yield* client.getByMalId(3003);
          const third = yield* client.resolveMalIdFromAniListId(1003);
          const fourth = yield* client.resolveAniListIdFromMalId(3001);

          return { first, fourth, second, third } as const;
        }),
      ).pipe(Effect.provide(clientLayer));

      assert.deepStrictEqual(
        result.first.pipe(Option.map((entry) => entry.title)),
        Option.some("Alpha"),
      );
      assert.deepStrictEqual(
        result.second.pipe(Option.map((entry) => entry.title)),
        Option.some("Gamma"),
      );
      assert.deepStrictEqual(result.third, Option.some(3003));
      assert.deepStrictEqual(result.fourth, Option.some(1001));
      assert.deepStrictEqual(requestCount, 1);
      assert.deepStrictEqual(datasetReadCount, 1);
    }),
  ),
);

it.scoped("ManamiClient uses local cache across layer restarts", () =>
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

it.scoped("ManamiClient refreshes stale local cache", () =>
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

const decodeSyntheticDataset = Schema.decodeUnknown(ManamiDatasetSchema)(SYNTHETIC_DATASET);
