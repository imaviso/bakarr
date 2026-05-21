import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { dirname, join, resolve } from "node:path";
import { Effect, Option, Schema } from "effect";

import { ManamiDatasetSchema, type ManamiDataset } from "@/features/media/metadata/manami-model.ts";
import {
  parseAniListIdFromSource,
  parseMalIdFromSource,
} from "@/features/media/metadata/manami-url.ts";
import type { ClockServiceShape } from "@/infra/clock.ts";
import { ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import { isNotFoundError } from "@/infra/filesystem/fs-errors.ts";

export const MANAMI_DATASET_URL =
  "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json";

export const MANAMI_CACHE_DIR_NAME = "cache";
export const MANAMI_CACHE_DATASET_FILE = "manami-anime-offline-database-minified.json";
export const MANAMI_CACHE_SQLITE_FILE = "manami-anime-offline-database.sqlite";
export const MANAMI_CACHE_META_FILE = "manami-anime-offline-database-meta.json";
export const MANAMI_CACHE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const ManamiCacheMetaSchema = Schema.Struct({
  fetchedAtMs: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
});

const ManamiDatasetJsonSchema = Schema.parseJson(ManamiDatasetSchema);
const ManamiCacheMetaJsonSchema = Schema.parseJson(ManamiCacheMetaSchema);

export interface ManamiCachePaths {
  readonly datasetFile: string;
  readonly directory: string;
  readonly metaFile: string;
  readonly sqliteFile: string;
}

type CacheState =
  | { readonly _tag: "Fresh" }
  | { readonly _tag: "InvalidSqlite" }
  | { readonly _tag: "MissingMeta" }
  | { readonly _tag: "Stale" };

export const refreshSqliteCacheIfNeeded = Effect.fn("ManamiCache.refreshSqliteCacheIfNeeded")(
  function* (
    client: HttpClient.HttpClient,
    clock: ClockServiceShape,
    externalCall: ExternalCallShape,
    fs: FileSystemShape,
    sqliteClient: NodeSqliteClient.SqliteClient,
    paths: ManamiCachePaths,
  ) {
    const now = yield* clock.currentTimeMillis;
    const cacheState = yield* inspectSqliteCacheState(fs, sqliteClient, paths, now);

    if (cacheState._tag === "Fresh") {
      return false;
    }

    if (cacheState._tag === "InvalidSqlite") {
      const rebuildResult = yield* readDatasetFromCache(fs, paths).pipe(
        Effect.flatMap((dataset) => buildLookupSqliteCache(sqliteClient, dataset)),
        Effect.either,
      );

      if (rebuildResult._tag === "Right") {
        return true;
      }
    }

    const dataset = yield* downloadManamiDataset(client, externalCall);
    yield* writeDatasetToCache(fs, paths, dataset);
    yield* buildLookupSqliteCache(sqliteClient, dataset);
    yield* writeCacheMeta(fs, paths, now);
    return true;
  },
);

export function resolveManamiCachePaths(databaseFile: string): ManamiCachePaths {
  const root = dirname(resolve(databaseFile));
  const directory = join(root, MANAMI_CACHE_DIR_NAME);

  return {
    datasetFile: join(directory, MANAMI_CACHE_DATASET_FILE),
    directory,
    metaFile: join(directory, MANAMI_CACHE_META_FILE),
    sqliteFile: join(directory, MANAMI_CACHE_SQLITE_FILE),
  };
}

const inspectSqliteCacheState: (
  fs: FileSystemShape,
  sqliteClient: NodeSqliteClient.SqliteClient,
  paths: ManamiCachePaths,
  now: number,
) => Effect.Effect<CacheState, ExternalCallError> = Effect.fn(
  "ManamiCache.inspectSqliteCacheState",
)(function* (
  fs: FileSystemShape,
  sqliteClient: NodeSqliteClient.SqliteClient,
  paths: ManamiCachePaths,
  now: number,
) {
  const maybeMeta = yield* readCacheMeta(fs, paths);

  if (Option.isNone(maybeMeta)) {
    return { _tag: "MissingMeta" } as const;
  }

  if (now - maybeMeta.value.fetchedAtMs >= MANAMI_CACHE_REFRESH_INTERVAL_MS) {
    return { _tag: "Stale" } as const;
  }

  const hasLookupSchema = yield* hasLookupSqliteSchema(sqliteClient).pipe(Effect.either);

  if (hasLookupSchema._tag === "Left") {
    return { _tag: "InvalidSqlite" } as const;
  }

  if (!hasLookupSchema.right) {
    return { _tag: "InvalidSqlite" } as const;
  }

  return { _tag: "Fresh" } as const;
});

const readCacheMeta = Effect.fn("ManamiCache.readCacheMeta")(function* (
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
          operation: "manami.sqlite.cache.meta.read",
        }),
      );
    }),
  );

  if (Option.isNone(bytes)) {
    return Option.none<Schema.Schema.Type<typeof ManamiCacheMetaSchema>>();
  }

  const json = yield* decodeUtf8(bytes.value, "manami.sqlite.cache.meta.decode");
  const metadata = yield* Schema.decode(ManamiCacheMetaJsonSchema)(json).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cache metadata decode failed",
        operation: "manami.sqlite.cache.meta.json",
      }),
    ),
  );

  return Option.some(metadata);
});

const readDatasetFromCache = Effect.fn("ManamiCache.readDatasetFromCache")(function* (
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

const writeDatasetToCache = Effect.fn("ManamiCache.writeDatasetToCache")(function* (
  fs: FileSystemShape,
  paths: ManamiCachePaths,
  dataset: ManamiDataset,
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
});

const writeCacheMeta = Effect.fn("ManamiCache.writeCacheMeta")(function* (
  fs: FileSystemShape,
  paths: ManamiCachePaths,
  fetchedAtMs: number,
) {
  const metaJson = yield* Schema.encode(ManamiCacheMetaJsonSchema)({ fetchedAtMs }).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cache metadata encode failed",
        operation: "manami.sqlite.cache.meta.encode",
      }),
    ),
  );

  yield* fs.writeFile(paths.metaFile, textEncoder.encode(metaJson)).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami cache metadata write failed",
        operation: "manami.sqlite.cache.meta.write",
      }),
    ),
  );
});

const downloadManamiDataset = Effect.fn("ManamiCache.downloadDataset")(function* (
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

  const datasetJson = yield* response.text.pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami dataset read failed",
        operation: "manami.dataset.read",
      }),
    ),
  );

  return yield* Schema.decode(ManamiDatasetJsonSchema)(datasetJson).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami dataset decode failed",
        operation: "manami.dataset.json",
      }),
    ),
  );
});

const buildLookupSqliteCache = Effect.fn("ManamiCache.buildLookupSqliteCache")(
  (
    sqliteClient: NodeSqliteClient.SqliteClient,
    dataset: ManamiDataset,
  ): Effect.Effect<void, ExternalCallError> =>
    sqliteClient
      .withTransaction(
        Effect.gen(function* () {
          yield* sqliteClient
            .unsafe("DROP TABLE IF EXISTS manami_anilist_lookup")
            .withoutTransform.pipe(
              Effect.mapError((cause) =>
                ExternalCallError.make({
                  cause,
                  message: "Manami sqlite schema setup failed",
                  operation: "manami.sqlite.cache.schema",
                }),
              ),
            );
          yield* sqliteClient
            .unsafe("DROP TABLE IF EXISTS manami_mal_lookup")
            .withoutTransform.pipe(
              Effect.mapError((cause) =>
                ExternalCallError.make({
                  cause,
                  message: "Manami sqlite schema setup failed",
                  operation: "manami.sqlite.cache.schema",
                }),
              ),
            );
          yield* sqliteClient.unsafe("DROP TABLE IF EXISTS manami_search").withoutTransform.pipe(
            Effect.mapError((cause) =>
              ExternalCallError.make({
                cause,
                message: "Manami sqlite schema setup failed",
                operation: "manami.sqlite.cache.schema",
              }),
            ),
          );
          yield* sqliteClient
            .unsafe(
              "CREATE TABLE manami_anilist_lookup (anilist_id INTEGER PRIMARY KEY NOT NULL, mal_id INTEGER, title TEXT NOT NULL, english_title TEXT, native_title TEXT)",
            )
            .withoutTransform.pipe(
              Effect.mapError((cause) =>
                ExternalCallError.make({
                  cause,
                  message: "Manami sqlite schema setup failed",
                  operation: "manami.sqlite.cache.schema",
                }),
              ),
            );
          yield* sqliteClient
            .unsafe(
              "CREATE TABLE manami_mal_lookup (mal_id INTEGER PRIMARY KEY NOT NULL, anilist_id INTEGER, title TEXT NOT NULL, english_title TEXT, native_title TEXT)",
            )
            .withoutTransform.pipe(
              Effect.mapError((cause) =>
                ExternalCallError.make({
                  cause,
                  message: "Manami sqlite schema setup failed",
                  operation: "manami.sqlite.cache.schema",
                }),
              ),
            );
          yield* sqliteClient
            .unsafe(
              "CREATE VIRTUAL TABLE manami_search USING fts5(anilist_id UNINDEXED, mal_id UNINDEXED, title, english_title, native_title, synonyms)",
            )
            .withoutTransform.pipe(
              Effect.mapError((cause) =>
                ExternalCallError.make({
                  cause,
                  message: "Manami sqlite schema setup failed",
                  operation: "manami.sqlite.cache.schema",
                }),
              ),
            );

          yield* Effect.forEach(
            dataset.data,
            (entry) =>
              Effect.gen(function* () {
                const aniListId = firstParsedId(entry.sources, parseAniListIdFromSource);
                const malId = firstParsedId(entry.sources, parseMalIdFromSource);

                if (aniListId === undefined && malId === undefined) {
                  return;
                }

                const fallback = deriveTitleFallback(entry.title, entry.synonyms);
                const synonyms = normalizeSynonyms(entry.synonyms).join("\n");

                if (aniListId !== undefined) {
                  yield* sqliteClient
                    .unsafe(
                      "INSERT INTO manami_anilist_lookup (anilist_id, mal_id, title, english_title, native_title) VALUES (?, ?, ?, ?, ?) ON CONFLICT(anilist_id) DO UPDATE SET mal_id = COALESCE(manami_anilist_lookup.mal_id, excluded.mal_id)",
                      [
                        aniListId,
                        malId ?? null,
                        entry.title,
                        fallback.englishTitle ?? null,
                        fallback.nativeTitle ?? null,
                      ],
                    )
                    .withoutTransform.pipe(
                      Effect.mapError((cause) =>
                        ExternalCallError.make({
                          cause,
                          message: "Manami sqlite anilist row insert failed",
                          operation: "manami.sqlite.cache.insert_anilist",
                        }),
                      ),
                    );
                }

                if (malId !== undefined) {
                  yield* sqliteClient
                    .unsafe(
                      "INSERT INTO manami_mal_lookup (mal_id, anilist_id, title, english_title, native_title) VALUES (?, ?, ?, ?, ?) ON CONFLICT(mal_id) DO UPDATE SET anilist_id = COALESCE(manami_mal_lookup.anilist_id, excluded.anilist_id)",
                      [
                        malId,
                        aniListId ?? null,
                        entry.title,
                        fallback.englishTitle ?? null,
                        fallback.nativeTitle ?? null,
                      ],
                    )
                    .withoutTransform.pipe(
                      Effect.mapError((cause) =>
                        ExternalCallError.make({
                          cause,
                          message: "Manami sqlite mal row insert failed",
                          operation: "manami.sqlite.cache.insert_mal",
                        }),
                      ),
                    );
                }

                if (aniListId !== undefined) {
                  yield* sqliteClient
                    .unsafe(
                      "INSERT INTO manami_search (anilist_id, mal_id, title, english_title, native_title, synonyms) VALUES (?, ?, ?, ?, ?, ?)",
                      [
                        aniListId,
                        malId ?? null,
                        entry.title,
                        fallback.englishTitle ?? null,
                        fallback.nativeTitle ?? null,
                        synonyms,
                      ],
                    )
                    .withoutTransform.pipe(
                      Effect.mapError((cause) =>
                        ExternalCallError.make({
                          cause,
                          message: "Manami sqlite search row insert failed",
                          operation: "manami.sqlite.cache.insert_search",
                        }),
                      ),
                    );
                }
              }),
            { discard: true },
          );
        }),
      )
      .pipe(
        Effect.mapError((cause) =>
          cause instanceof ExternalCallError
            ? cause
            : ExternalCallError.make({
                cause,
                message: "Manami sqlite cache build failed",
                operation: "manami.sqlite.cache.build",
              }),
        ),
      ),
);

const hasLookupSqliteSchema = Effect.fn("ManamiCache.hasLookupSqliteSchema")(
  (sqliteClient: NodeSqliteClient.SqliteClient): Effect.Effect<boolean, ExternalCallError> =>
    sqliteClient
      .unsafe<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('manami_anilist_lookup', 'manami_mal_lookup', 'manami_search')",
      )
      .withoutTransform.pipe(
        Effect.map((rows) => rows.length === 3),
        Effect.mapError((cause) =>
          ExternalCallError.make({
            cause,
            message: "Manami sqlite cache validation failed",
            operation: "manami.sqlite.cache.validate",
          }),
        ),
      ),
);

function normalizeSynonyms(values: ReadonlyArray<string> | undefined) {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const value of values ?? []) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function deriveTitleFallback(title: string, synonyms: ReadonlyArray<string> | undefined) {
  const candidates = [title, ...(synonyms ?? [])]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const englishTitle = candidates.find((value) => isMostlyLatin(value));
  const nativeTitle = candidates.find((value) => !isMostlyLatin(value));

  return {
    ...(englishTitle === undefined ? {} : { englishTitle }),
    ...(nativeTitle === undefined ? {} : { nativeTitle }),
  };
}

function isMostlyLatin(value: string): boolean {
  return /^[\p{Script=Latin}\p{M}\p{N}\p{P}\p{Zs}]+$/u.test(value);
}

function firstParsedId(
  sources: ReadonlyArray<string>,
  parse: (source: string) => number | undefined,
): number | undefined {
  for (const source of sources) {
    const parsed = parse(source);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

const decodeUtf8 = Effect.fn("ManamiCache.decodeUtf8")(
  (bytes: Uint8Array, operation: string): Effect.Effect<string, ExternalCallError> =>
    Effect.try({
      try: () => textDecoder.decode(bytes),
      catch: (cause) =>
        ExternalCallError.make({
          cause,
          message: "Manami cache utf8 decode failed",
          operation,
        }),
    }),
);
