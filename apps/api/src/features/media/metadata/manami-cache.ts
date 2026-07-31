import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { Headers, HttpClient, HttpClientRequest } from "@effect/platform";
import { dirname, join, resolve } from "node:path";
import { Effect, Option, Schema } from "effect";

import { ManamiDatasetSchema, type ManamiDataset } from "@/features/media/metadata/manami-model.ts";
import {
  parseAniListIdFromSource,
  parseMalIdFromSource,
} from "@/features/media/metadata/manami-url.ts";
import { currentTimeMillis } from "@/infra/time.ts";
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
  etag: Schema.optional(Schema.String),
  lastModified: Schema.optional(Schema.String),
});

type ManamiCacheMeta = Schema.Schema.Type<typeof ManamiCacheMetaSchema>;

const ManamiDatasetJsonSchema = Schema.parseJson(ManamiDatasetSchema);
const ManamiCacheMetaJsonSchema = Schema.parseJson(ManamiCacheMetaSchema);

export interface ManamiCachePaths {
  readonly datasetFile: string;
  readonly directory: string;
  readonly metaFile: string;
  readonly sqliteFile: string;
}

interface CacheValidators {
  readonly etag?: string | undefined;
  readonly lastModified?: string | undefined;
}

type DownloadResult =
  | { readonly _tag: "NotModified" }
  | {
      readonly _tag: "Downloaded";
      readonly dataset: ManamiDataset;
      readonly etag?: string | undefined;
      readonly lastModified?: string | undefined;
    };

export const refreshSqliteCacheIfNeeded = Effect.fn("ManamiCache.refreshSqliteCacheIfNeeded")(
  function* (
    client: HttpClient.HttpClient,
    externalCall: ExternalCallShape,
    fs: FileSystemShape,
    sqliteClient: NodeSqliteClient.SqliteClient,
    paths: ManamiCachePaths,
  ) {
    const now = yield* currentTimeMillis;
    const meta = yield* readCacheMeta(fs, paths).pipe(Effect.map(Option.getOrUndefined));
    const metaFresh =
      meta !== undefined && now - meta.fetchedAtMs < MANAMI_CACHE_REFRESH_INTERVAL_MS;
    const sqliteValid = yield* hasLookupSqliteSchema(sqliteClient).pipe(
      Effect.catchAll(() => Effect.succeed(false)),
    );

    if (metaFresh && sqliteValid) {
      return false;
    }

    if (metaFresh) {
      // Meta fresh but sqlite broken: rebuild from the cached dataset first.
      const rebuilt = yield* rebuildFromCachedDataset(fs, sqliteClient, paths).pipe(Effect.either);
      if (rebuilt._tag === "Right") {
        return true;
      }
      // Cached dataset unusable too: fall through to an unconditional download.
      yield* downloadAndPersist();
      return true;
    }

    // Stale or missing meta: revalidate against upstream before downloading.
    const condition: CacheValidators | undefined =
      meta === undefined ? undefined : { etag: meta.etag, lastModified: meta.lastModified };
    const downloaded = yield* downloadManamiDataset(client, externalCall, condition);

    if (downloaded._tag === "NotModified") {
      if (!sqliteValid) {
        const rebuilt = yield* rebuildFromCachedDataset(fs, sqliteClient, paths).pipe(
          Effect.either,
        );
        if (rebuilt._tag === "Left") {
          // 304 but local cache unusable: fetch the full dataset unconditionally.
          yield* downloadAndPersist();
          return true;
        }
      }

      yield* writeCacheMeta(fs, paths, {
        fetchedAtMs: now,
        ...(meta?.etag === undefined ? {} : { etag: meta.etag }),
        ...(meta?.lastModified === undefined ? {} : { lastModified: meta.lastModified }),
      });
      return !sqliteValid;
    }

    yield* persistDownloadedDataset(downloaded);
    return true;

    function downloadAndPersist() {
      return Effect.gen(function* () {
        const result = yield* downloadManamiDataset(client, externalCall);
        if (result._tag === "NotModified") {
          return yield* Effect.dieMessage(
            "manami dataset download returned 304 without conditional validators",
          );
        }
        yield* persistDownloadedDataset(result);
        return undefined;
      });
    }

    function persistDownloadedDataset(
      result: Extract<DownloadResult, { readonly _tag: "Downloaded" }>,
    ) {
      return Effect.gen(function* () {
        yield* writeDatasetToCache(fs, paths, result.dataset);
        yield* buildLookupSqliteCache(sqliteClient, result.dataset);
        yield* writeCacheMeta(fs, paths, {
          fetchedAtMs: now,
          ...(result.etag === undefined ? {} : { etag: result.etag }),
          ...(result.lastModified === undefined ? {} : { lastModified: result.lastModified }),
        });
      });
    }
  },
);

const rebuildFromCachedDataset = Effect.fn("ManamiCache.rebuildFromCachedDataset")(function* (
  fs: FileSystemShape,
  sqliteClient: NodeSqliteClient.SqliteClient,
  paths: ManamiCachePaths,
) {
  const dataset = yield* readDatasetFromCache(fs, paths);
  yield* buildLookupSqliteCache(sqliteClient, dataset);
});

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
  meta: ManamiCacheMeta,
) {
  const metaJson = yield* Schema.encode(ManamiCacheMetaJsonSchema)(meta).pipe(
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
  condition?: CacheValidators,
) {
  const request = HttpClientRequest.get(MANAMI_DATASET_URL).pipe(
    HttpClientRequest.setHeaders({
      ...(condition?.etag === undefined ? {} : { "If-None-Match": condition.etag }),
      ...(condition?.lastModified === undefined
        ? {}
        : { "If-Modified-Since": condition.lastModified }),
    }),
  );
  const response = yield* externalCall.tryExternalEffect(
    "manami.dataset.download",
    client.execute(request),
  );

  if (response.status === 304) {
    return { _tag: "NotModified" } as const;
  }

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

  const dataset = yield* Schema.decode(ManamiDatasetJsonSchema)(datasetJson).pipe(
    Effect.mapError((cause) =>
      ExternalCallError.make({
        cause,
        message: "Manami dataset decode failed",
        operation: "manami.dataset.json",
      }),
    ),
  );

  const etag = Headers.get(response.headers, "etag");
  const lastModified = Headers.get(response.headers, "last-modified");

  return {
    _tag: "Downloaded",
    dataset,
    ...(Option.isSome(etag) ? { etag: etag.value } : {}),
    ...(Option.isSome(lastModified) ? { lastModified: lastModified.value } : {}),
  } as const;
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

          const anilistRows: (readonly [
            number,
            number | null,
            string,
            string | null,
            string | null,
          ])[] = [];
          const malRows: (readonly [
            number,
            number | null,
            string,
            string | null,
            string | null,
          ])[] = [];
          const searchRows: (readonly [
            number,
            number | null,
            string,
            string | null,
            string | null,
            string,
          ])[] = [];

          for (const entry of dataset.data) {
            const aniListId = firstParsedId(entry.sources, parseAniListIdFromSource);
            const malId = firstParsedId(entry.sources, parseMalIdFromSource);

            if (aniListId === undefined && malId === undefined) {
              continue;
            }

            const fallback = deriveTitleFallback(entry.title, entry.synonyms);
            const englishTitle = fallback.englishTitle ?? null;
            const nativeTitle = fallback.nativeTitle ?? null;

            if (aniListId !== undefined) {
              anilistRows.push([aniListId, malId ?? null, entry.title, englishTitle, nativeTitle]);
            }

            if (malId !== undefined) {
              malRows.push([malId, aniListId ?? null, entry.title, englishTitle, nativeTitle]);
            }

            if (aniListId !== undefined) {
              searchRows.push([
                aniListId,
                malId ?? null,
                entry.title,
                englishTitle,
                nativeTitle,
                normalizeSynonyms(entry.synonyms).join("\n"),
              ]);
            }
          }

          yield* insertRowsInBatches(
            sqliteClient,
            anilistRows,
            (rowCount) =>
              `INSERT INTO manami_anilist_lookup (anilist_id, mal_id, title, english_title, native_title) VALUES ${valuePlaceholders(rowCount, 5)} ON CONFLICT(anilist_id) DO UPDATE SET mal_id = COALESCE(manami_anilist_lookup.mal_id, excluded.mal_id)`,
            "Manami sqlite anilist row insert failed",
            "manami.sqlite.cache.insert_anilist",
          );
          yield* insertRowsInBatches(
            sqliteClient,
            malRows,
            (rowCount) =>
              `INSERT INTO manami_mal_lookup (mal_id, anilist_id, title, english_title, native_title) VALUES ${valuePlaceholders(rowCount, 5)} ON CONFLICT(mal_id) DO UPDATE SET anilist_id = COALESCE(manami_mal_lookup.anilist_id, excluded.anilist_id)`,
            "Manami sqlite mal row insert failed",
            "manami.sqlite.cache.insert_mal",
          );
          yield* insertRowsInBatches(
            sqliteClient,
            searchRows,
            (rowCount) =>
              `INSERT INTO manami_search (anilist_id, mal_id, title, english_title, native_title, synonyms) VALUES ${valuePlaceholders(rowCount, 6)}`,
            "Manami sqlite search row insert failed",
            "manami.sqlite.cache.insert_search",
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

const MANAMI_INSERT_BATCH_SIZE = 500;

const insertRowsInBatches = (
  sqliteClient: NodeSqliteClient.SqliteClient,
  rows: ReadonlyArray<ReadonlyArray<string | number | null>>,
  buildStatement: (rowCount: number) => string,
  message: string,
  operation: string,
): Effect.Effect<void, ExternalCallError> =>
  Effect.forEach(
    chunkArray(rows, MANAMI_INSERT_BATCH_SIZE),
    (chunk) =>
      sqliteClient.unsafe(buildStatement(chunk.length), chunk.flat()).withoutTransform.pipe(
        Effect.mapError((cause) =>
          ExternalCallError.make({
            cause,
            message,
            operation,
          }),
        ),
      ),
    { discard: true },
  );

function chunkArray<T>(rows: ReadonlyArray<T>, size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}

function valuePlaceholders(rowCount: number, columnCount: number) {
  const row = `(${Array.from({ length: columnCount }, () => "?").join(", ")})`;
  return Array.from({ length: rowCount }, () => row).join(", ");
}

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
