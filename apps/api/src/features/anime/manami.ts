import { HttpClient, HttpClientRequest, HttpClientResponse } from "@effect/platform";
import { dirname, join, resolve } from "node:path";
import { Context, Effect, Layer, Option, Ref, Schema } from "effect";

import { AppConfig } from "@/config.ts";
import { buildManamiIndexes } from "@/features/anime/manami-index.ts";
import { ManamiDatasetSchema, type ManamiAnimeEntry } from "@/features/anime/manami-model.ts";
import { isNotFoundError } from "@/lib/fs-errors.ts";
import { makeSingleFlightEffectRunner } from "@/lib/effect-coalescing-single-flight-runner.ts";
import { ExternalCall, ExternalCallError, type ExternalCallShape } from "@/lib/effect-retry.ts";
import { ClockService, type ClockServiceShape } from "@/lib/clock.ts";
import { FileSystem, type FileSystemShape } from "@/lib/filesystem.ts";

export const MANAMI_DATASET_URL =
  "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json";

export const MANAMI_CACHE_DIR_NAME = "cache";
export const MANAMI_CACHE_DATASET_FILE = "manami-anime-offline-database-minified.json";
export const MANAMI_CACHE_META_FILE = "manami-anime-offline-database-meta.json";
export const MANAMI_CACHE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const ManamiCacheMetaSchema = Schema.Struct({
  fetchedAtMs: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
});

const ManamiDatasetJsonSchema = Schema.parseJson(ManamiDatasetSchema);
const ManamiCacheMetaJsonSchema = Schema.parseJson(ManamiCacheMetaSchema);

interface ManamiClientShape {
  readonly getByAniListId: (
    anilistId: number,
  ) => Effect.Effect<Option.Option<ManamiAnimeEntry>, ExternalCallError>;
  readonly getByMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<ManamiAnimeEntry>, ExternalCallError>;
  readonly resolveAniListIdFromMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<number>, ExternalCallError>;
  readonly resolveMalIdFromAniListId: (
    anilistId: number,
  ) => Effect.Effect<Option.Option<number>, ExternalCallError>;
}

interface ManamiCachePaths {
  readonly datasetFile: string;
  readonly directory: string;
  readonly metaFile: string;
}

export class ManamiClient extends Context.Tag("@bakarr/api/ManamiClient")<
  ManamiClient,
  ManamiClientShape
>() {}

export const ManamiClientLive = Layer.effect(
  ManamiClient,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const client = yield* HttpClient.HttpClient;
    const clock = yield* ClockService;
    const externalCall = yield* ExternalCall;
    const fs = yield* FileSystem;
    const cachePaths = resolveCachePaths(appConfig.databaseFile);
    const indexesRef = yield* Ref.make<Option.Option<ReturnType<typeof buildManamiIndexes>>>(
      Option.none(),
    );
    const refreshRunner = yield* makeSingleFlightEffectRunner(
      refreshCacheIfNeeded(client, clock, externalCall, fs, cachePaths),
    );
    const buildIndexesRunner = yield* makeSingleFlightEffectRunner(
      Effect.gen(function* () {
        const dataset = yield* readDatasetFromCache(fs, cachePaths);
        const indexes = buildManamiIndexes(dataset);
        yield* Ref.set(indexesRef, Option.some(indexes));
        return indexes;
      }),
    );

    const loadIndexes = Effect.fn("ManamiClient.loadIndexes")(function* () {
      const refreshed = yield* refreshRunner.trigger;

      if (!refreshed) {
        const indexes = yield* Ref.get(indexesRef);

        if (Option.isSome(indexes)) {
          return indexes.value;
        }
      }

      return yield* buildIndexesRunner.trigger;
    });

    const getByAniListId = Effect.fn("ManamiClient.getByAniListId")(function* (anilistId: number) {
      const indexes = yield* loadIndexes();
      return Option.fromNullable(indexes.byAniListId.get(anilistId));
    });

    const getByMalId = Effect.fn("ManamiClient.getByMalId")(function* (malId: number) {
      const indexes = yield* loadIndexes();
      const aniListId = indexes.aniListIdByMalId.get(malId);

      if (aniListId !== undefined) {
        const mapped = indexes.byAniListId.get(aniListId);

        if (mapped !== undefined) {
          return Option.some(mapped);
        }
      }

      return Option.fromNullable(indexes.malOnlyByMalId.get(malId));
    });

    const resolveMalIdFromAniListId = Effect.fn("ManamiClient.resolveMalIdFromAniListId")(
      function* (anilistId: number) {
        const indexes = yield* loadIndexes();
        return Option.fromNullable(indexes.malIdByAniListId.get(anilistId));
      },
    );

    const resolveAniListIdFromMalId = Effect.fn("ManamiClient.resolveAniListIdFromMalId")(
      function* (malId: number) {
        const indexes = yield* loadIndexes();
        return Option.fromNullable(indexes.aniListIdByMalId.get(malId));
      },
    );

    return ManamiClient.of({
      getByAniListId,
      getByMalId,
      resolveAniListIdFromMalId,
      resolveMalIdFromAniListId,
    });
  }),
);

const refreshCacheIfNeeded = Effect.fn("ManamiClient.refreshCacheIfNeeded")(function* (
  client: HttpClient.HttpClient,
  clock: ClockServiceShape,
  externalCall: ExternalCallShape,
  fs: FileSystemShape,
  paths: ManamiCachePaths,
) {
  const now = yield* clock.currentTimeMillis;
  const fresh = yield* isCacheFresh(fs, paths, now);

  if (fresh) {
    return false;
  }

  const dataset = yield* downloadManamiDataset(client, externalCall);
  yield* writeDatasetToCache(fs, paths, now, dataset);
  return true;
});

const isCacheFresh = Effect.fn("ManamiClient.isCacheFresh")(function* (
  fs: FileSystemShape,
  paths: ManamiCachePaths,
  now: number,
) {
  const maybeMeta = yield* readCacheMeta(fs, paths);

  if (Option.isNone(maybeMeta)) {
    return false;
  }

  if (now - maybeMeta.value.fetchedAtMs >= MANAMI_CACHE_REFRESH_INTERVAL_MS) {
    return false;
  }

  const hasDatasetFile = yield* fs.stat(paths.datasetFile).pipe(
    Effect.as(true),
    Effect.catchAll((error) => {
      if (isNotFoundError(error)) {
        return Effect.succeed(false);
      }

      return Effect.fail(
        ExternalCallError.make({
          cause: error,
          message: "Manami dataset cache stat failed",
          operation: "manami.dataset.cache.stat",
        }),
      );
    }),
  );

  return hasDatasetFile;
});

const readCacheMeta = Effect.fn("ManamiClient.readCacheMeta")(function* (
  fs: FileSystemShape,
  paths: ManamiCachePaths,
) {
  const bytes = yield* fs.readFile(paths.metaFile).pipe(
    Effect.map(Option.some),
    Effect.catchAll((error) => {
      if (isNotFoundError(error)) {
        return Effect.succeed(Option.none<Uint8Array>());
      }

      return Effect.fail(
        ExternalCallError.make({
          cause: error,
          message: "Manami cache metadata read failed",
          operation: "manami.dataset.cache.meta.read",
        }),
      );
    }),
  );

  if (Option.isNone(bytes)) {
    return Option.none<Schema.Schema.Type<typeof ManamiCacheMetaSchema>>();
  }

  const json = yield* decodeUtf8(bytes.value, "manami.dataset.cache.meta.decode");
  const metadata = yield* Schema.decode(ManamiCacheMetaJsonSchema)(json).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cache metadata decode failed",
        operation: "manami.dataset.cache.meta.json",
      }),
    ),
  );

  return Option.some(metadata);
});

const readDatasetFromCache = Effect.fn("ManamiClient.readDatasetFromCache")(function* (
  fs: FileSystemShape,
  paths: ManamiCachePaths,
) {
  const bytes = yield* fs.readFile(paths.datasetFile).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cached dataset read failed",
        operation: "manami.dataset.cache.read",
      }),
    ),
  );
  const json = yield* decodeUtf8(bytes, "manami.dataset.cache.decode");

  return yield* Schema.decode(ManamiDatasetJsonSchema)(json).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cached dataset decode failed",
        operation: "manami.dataset.cache.json",
      }),
    ),
  );
});

const writeDatasetToCache = Effect.fn("ManamiClient.writeDatasetToCache")(function* (
  fs: FileSystemShape,
  paths: ManamiCachePaths,
  fetchedAtMs: number,
  dataset: Schema.Schema.Type<typeof ManamiDatasetSchema>,
) {
  yield* fs.mkdir(paths.directory, { recursive: true }).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cache directory creation failed",
        operation: "manami.dataset.cache.mkdir",
      }),
    ),
  );

  const datasetJson = yield* Schema.encode(ManamiDatasetJsonSchema)(dataset).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cached dataset encode failed",
        operation: "manami.dataset.cache.encode",
      }),
    ),
  );
  yield* fs.writeFile(paths.datasetFile, textEncoder.encode(datasetJson)).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cached dataset write failed",
        operation: "manami.dataset.cache.write",
      }),
    ),
  );

  const metaJson = yield* Schema.encode(ManamiCacheMetaJsonSchema)({ fetchedAtMs }).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cache metadata encode failed",
        operation: "manami.dataset.cache.meta.encode",
      }),
    ),
  );

  yield* fs.writeFile(paths.metaFile, textEncoder.encode(metaJson)).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cache metadata write failed",
        operation: "manami.dataset.cache.meta.write",
      }),
    ),
  );
});

const downloadManamiDataset = Effect.fn("ManamiClient.downloadDataset")(function* (
  client: HttpClient.HttpClient,
  externalCall: ExternalCallShape,
) {
  const request = HttpClientRequest.get(MANAMI_DATASET_URL);
  const response = yield* externalCall.tryExternalEffect(
    "manami.dataset.download",
    client.execute(request),
  );

  if (response.status < 200 || response.status >= 300) {
    return yield* ExternalCallError.make({
      cause: new Error(`Manami dataset download failed with status ${response.status}`),
      message: "Manami dataset download failed",
      operation: "manami.dataset.response",
    });
  }

  return yield* HttpClientResponse.schemaBodyJson(ManamiDatasetSchema)(response).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami dataset decode failed",
        operation: "manami.dataset.json",
      }),
    ),
  );
});

const decodeUtf8 = Effect.fn("ManamiClient.decodeUtf8")(
  (bytes: Uint8Array, operation: string): Effect.Effect<string, ExternalCallError> =>
    Effect.try({
      try: () => textDecoder.decode(bytes),
      catch: (cause) =>
        ExternalCallError.make({
          cause,
          message: "Manami dataset utf8 decode failed",
          operation,
        }),
    }),
);

function resolveCachePaths(databaseFile: string): ManamiCachePaths {
  const root = dirname(resolve(databaseFile));
  const directory = join(root, MANAMI_CACHE_DIR_NAME);

  return {
    datasetFile: join(directory, MANAMI_CACHE_DATASET_FILE),
    directory,
    metaFile: join(directory, MANAMI_CACHE_META_FILE),
  };
}
