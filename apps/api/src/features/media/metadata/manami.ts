import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { dirname, join, resolve } from "node:path";
import { Context, Effect, Layer, Option, Schema } from "effect";

import { brandMediaId, type MediaSearchResult } from "@packages/shared/index.ts";
import { AppConfig } from "@/config/schema.ts";
import { ManamiDatasetSchema, type ManamiDataset } from "@/features/media/metadata/manami-model.ts";
import {
  parseAniListIdFromSource,
  parseMalIdFromSource,
} from "@/features/media/metadata/manami-url.ts";
import { makeSingleFlightEffectRunner } from "@/infra/effect/coalescing-single-flight-runner.ts";
import { ExternalCall, ExternalCallError, type ExternalCallShape } from "@/infra/effect/retry.ts";
import { ClockService, type ClockServiceShape } from "@/infra/clock.ts";
import { FileSystem, type FileSystemShape } from "@/infra/filesystem/filesystem.ts";
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

export interface ManamiLookupEntry {
  readonly englishTitle?: string;
  readonly nativeTitle?: string;
  readonly title: string;
}

interface ManamiClientShape {
  readonly getByAniListId: (
    anilistId: number,
  ) => Effect.Effect<Option.Option<ManamiLookupEntry>, ExternalCallError>;
  readonly getByMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<ManamiLookupEntry>, ExternalCallError>;
  readonly resolveAniListIdFromMalId: (
    malId: number,
  ) => Effect.Effect<Option.Option<number>, ExternalCallError>;
  readonly resolveMalIdFromAniListId: (
    anilistId: number,
  ) => Effect.Effect<Option.Option<number>, ExternalCallError>;
  readonly searchAnime: (
    query: string,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<MediaSearchResult>, ExternalCallError>;
}

interface ManamiCachePaths {
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

interface LookupRow {
  readonly english_title: string | null;
  readonly native_title: string | null;
  readonly title: string;
}

interface SearchRow {
  readonly anilist_id: number;
  readonly english_title: string | null;
  readonly native_title: string | null;
  readonly synonyms: string;
  readonly title: string;
}

interface LookupIdRow {
  readonly value: number;
}

export class ManamiClient extends Context.Tag("@bakarr/api/ManamiClient")<
  ManamiClient,
  ManamiClientShape
>() {}

export const ManamiSqliteClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const fs = yield* FileSystem;
    const cachePaths = resolveCachePaths(appConfig.databaseFile);

    yield* fs.mkdir(cachePaths.directory, { recursive: true }).pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "Manami cache directory creation failed",
          operation: "manami.dataset.cache.mkdir",
        }),
      ),
    );

    return NodeSqliteClient.layer({
      filename: cachePaths.sqliteFile,
    }).pipe(
      Layer.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "Manami sqlite open failed",
          operation: "manami.sqlite.open",
        }),
      ),
    );
  }),
);

const ManamiClientLayer = Layer.scoped(
  ManamiClient,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const client = yield* HttpClient.HttpClient;
    const clock = yield* ClockService;
    const externalCall = yield* ExternalCall;
    const fs = yield* FileSystem;
    const sqliteClient = yield* NodeSqliteClient.SqliteClient;
    const cachePaths = resolveCachePaths(appConfig.databaseFile);
    yield* fs.mkdir(cachePaths.directory, { recursive: true }).pipe(
      Effect.mapError((cause) =>
        ExternalCallError.make({
          cause,
          message: "Manami cache directory creation failed",
          operation: "manami.dataset.cache.mkdir",
        }),
      ),
    );
    const refreshRunner = yield* makeSingleFlightEffectRunner(
      refreshSqliteCacheIfNeeded(client, clock, externalCall, fs, sqliteClient, cachePaths),
    );

    const ensureReady = Effect.fn("ManamiClient.ensureReady")(function* () {
      yield* refreshRunner.trigger;
    });

    const getByAniListId = Effect.fn("ManamiClient.getByAniListId")(function* (anilistId: number) {
      yield* ensureReady();

      return yield* sqliteClient
        .unsafe<LookupRow>(
          `
          SELECT title, english_title, native_title
          FROM manami_anilist_lookup
          WHERE anilist_id = ?
          LIMIT 1
          `,
          [anilistId],
        )
        .withoutTransform.pipe(
          Effect.map((rows) => Option.fromNullable(toLookupEntry(rows[0]))),
          Effect.mapError((cause) =>
            ExternalCallError.make({
              cause,
              message: "Manami sqlite lookup by AniList id failed",
              operation: "manami.sqlite.lookup.by_anilist",
            }),
          ),
        );
    });

    const getByMalId = Effect.fn("ManamiClient.getByMalId")(function* (malId: number) {
      yield* ensureReady();

      return yield* sqliteClient
        .unsafe<LookupRow>(
          `
          SELECT
            COALESCE(anilist.title, mal.title) AS title,
            COALESCE(anilist.english_title, mal.english_title) AS english_title,
            COALESCE(anilist.native_title, mal.native_title) AS native_title
          FROM manami_mal_lookup AS mal
          LEFT JOIN manami_anilist_lookup AS anilist
            ON anilist.anilist_id = mal.anilist_id
          WHERE mal.mal_id = ?
          LIMIT 1
          `,
          [malId],
        )
        .withoutTransform.pipe(
          Effect.map((rows) => Option.fromNullable(toLookupEntry(rows[0]))),
          Effect.mapError((cause) =>
            ExternalCallError.make({
              cause,
              message: "Manami sqlite lookup by MAL id failed",
              operation: "manami.sqlite.lookup.by_mal",
            }),
          ),
        );
    });

    const resolveMalIdFromAniListId = Effect.fn("ManamiClient.resolveMalIdFromAniListId")(
      function* (anilistId: number) {
        yield* ensureReady();

        return yield* sqliteClient
          .unsafe<LookupIdRow>(
            `
            SELECT mal_id AS value
            FROM manami_anilist_lookup
            WHERE anilist_id = ?
              AND mal_id IS NOT NULL
            LIMIT 1
            `,
            [anilistId],
          )
          .withoutTransform.pipe(
            Effect.map((rows) => Option.fromNullable(rows[0]?.value)),
            Effect.mapError((cause) =>
              ExternalCallError.make({
                cause,
                message: "Manami sqlite resolve MAL id failed",
                operation: "manami.sqlite.lookup.resolve_mal",
              }),
            ),
          );
      },
    );

    const resolveAniListIdFromMalId = Effect.fn("ManamiClient.resolveAniListIdFromMalId")(
      function* (malId: number) {
        yield* ensureReady();

        return yield* sqliteClient
          .unsafe<LookupIdRow>(
            `
            SELECT anilist_id AS value
            FROM manami_mal_lookup
            WHERE mal_id = ?
              AND anilist_id IS NOT NULL
            LIMIT 1
            `,
            [malId],
          )
          .withoutTransform.pipe(
            Effect.map((rows) => Option.fromNullable(rows[0]?.value)),
            Effect.mapError((cause) =>
              ExternalCallError.make({
                cause,
                message: "Manami sqlite resolve AniList id failed",
                operation: "manami.sqlite.lookup.resolve_anilist",
              }),
            ),
          );
      },
    );

    const searchAnime = Effect.fn("ManamiClient.searchAnime")(function* (
      query: string,
      limit: number,
    ) {
      yield* ensureReady();

      const matchQuery = toFtsQuery(query);
      if (matchQuery.length === 0) {
        return [];
      }

      const resolvedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
      return yield* sqliteClient
        .unsafe<SearchRow>(
          `
          SELECT anilist_id, title, english_title, native_title, synonyms
          FROM manami_search
          WHERE manami_search MATCH ?
            AND anilist_id IS NOT NULL
          ORDER BY rank
          LIMIT ?
          `,
          [matchQuery, resolvedLimit],
        )
        .withoutTransform.pipe(
          Effect.map((rows) => rows.map(toSearchResult)),
          Effect.mapError((cause) =>
            ExternalCallError.make({
              cause,
              message: "Manami sqlite search failed",
              operation: "manami.sqlite.search",
            }),
          ),
        );
    });

    return ManamiClient.of({
      getByAniListId,
      getByMalId,
      resolveAniListIdFromMalId,
      resolveMalIdFromAniListId,
      searchAnime,
    });
  }),
);

export const ManamiClientLive = ManamiClientLayer.pipe(Layer.provide(ManamiSqliteClientLive));

const refreshSqliteCacheIfNeeded = Effect.fn("ManamiClient.refreshSqliteCacheIfNeeded")(function* (
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
});

const inspectSqliteCacheState: (
  fs: FileSystemShape,
  sqliteClient: NodeSqliteClient.SqliteClient,
  paths: ManamiCachePaths,
  now: number,
) => Effect.Effect<CacheState, ExternalCallError> = Effect.fn(
  "ManamiClient.inspectSqliteCacheState",
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

const writeCacheMeta = Effect.fn("ManamiClient.writeCacheMeta")(function* (
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

const buildLookupSqliteCache = Effect.fn("ManamiClient.buildLookupSqliteCache")(
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

const hasLookupSqliteSchema = Effect.fn("ManamiClient.hasLookupSqliteSchema")(
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

function toLookupEntry(row: LookupRow | undefined): ManamiLookupEntry | undefined {
  if (row === undefined) {
    return undefined;
  }

  return {
    ...(row.english_title === null ? {} : { englishTitle: row.english_title }),
    ...(row.native_title === null ? {} : { nativeTitle: row.native_title }),
    title: row.title,
  };
}

function toSearchResult(row: SearchRow): MediaSearchResult {
  const synonyms = row.synonyms
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return {
    already_in_library: false,
    id: brandMediaId(row.anilist_id),
    ...(synonyms.length === 0 ? {} : { synonyms }),
    title: {
      ...(row.english_title === null ? {} : { english: row.english_title }),
      ...(row.native_title === null ? {} : { native: row.native_title }),
      romaji: row.title,
    },
  } satisfies MediaSearchResult;
}

function toFtsQuery(query: string) {
  return (
    query
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.map((token) => `${token}*`)
      .join(" ") ?? ""
  );
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

const decodeUtf8 = Effect.fn("ManamiClient.decodeUtf8")(
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

function resolveCachePaths(databaseFile: string): ManamiCachePaths {
  const root = dirname(resolve(databaseFile));
  const directory = join(root, MANAMI_CACHE_DIR_NAME);

  return {
    datasetFile: join(directory, MANAMI_CACHE_DATASET_FILE),
    directory,
    metaFile: join(directory, MANAMI_CACHE_META_FILE),
    sqliteFile: join(directory, MANAMI_CACHE_SQLITE_FILE),
  };
}
