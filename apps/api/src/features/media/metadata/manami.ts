import * as NodeSqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { HttpClient } from "@effect/platform";
import { Context, Effect, Layer, Option } from "effect";

import { brandMediaId, type MediaSearchResult } from "@packages/shared/index.ts";
import { AppConfig } from "@/config/schema.ts";
import {
  refreshSqliteCacheIfNeeded,
  resolveManamiCachePaths,
} from "@/features/media/metadata/manami-cache.ts";
import { makeSingleFlightEffectRunner } from "@/infra/effect/coalescing-single-flight-runner.ts";
import { ExternalCall, ExternalCallError } from "@/infra/effect/retry.ts";
import { ClockService } from "@/infra/clock.ts";
import { FileSystem } from "@/infra/filesystem/filesystem.ts";

export {
  MANAMI_CACHE_DATASET_FILE,
  MANAMI_CACHE_DIR_NAME,
  MANAMI_CACHE_META_FILE,
  MANAMI_CACHE_REFRESH_INTERVAL_MS,
  MANAMI_CACHE_SQLITE_FILE,
  MANAMI_DATASET_URL,
} from "@/features/media/metadata/manami-cache.ts";

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

interface ManamiCacheRefreshClientShape {
  readonly refreshCacheIfNeeded: () => Effect.Effect<boolean, ExternalCallError>;
}

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

export class ManamiCacheRefreshClient extends Context.Tag("@bakarr/api/ManamiCacheRefreshClient")<
  ManamiCacheRefreshClient,
  ManamiCacheRefreshClientShape
>() {}

export const ManamiSqliteClientLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const fs = yield* FileSystem;
    const cachePaths = resolveManamiCachePaths(appConfig.databaseFile);

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

const ManamiLookupClientLayer = Layer.effect(
  ManamiClient,
  Effect.gen(function* () {
    const sqliteClient = yield* NodeSqliteClient.SqliteClient;

    const getByAniListId = Effect.fn("ManamiClient.getByAniListId")(function* (anilistId: number) {
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

const ManamiCacheRefreshClientLayer = Layer.scoped(
  ManamiCacheRefreshClient,
  Effect.gen(function* () {
    const appConfig = yield* AppConfig;
    const client = yield* HttpClient.HttpClient;
    const clock = yield* ClockService;
    const externalCall = yield* ExternalCall;
    const fs = yield* FileSystem;
    const sqliteClient = yield* NodeSqliteClient.SqliteClient;
    const cachePaths = resolveManamiCachePaths(appConfig.databaseFile);
    const refreshRunner = yield* makeSingleFlightEffectRunner(
      refreshSqliteCacheIfNeeded(client, clock, externalCall, fs, sqliteClient, cachePaths),
    );

    const refreshCacheIfNeeded = Effect.fn("ManamiCacheRefreshClient.refreshCacheIfNeeded")(
      function* () {
        return yield* refreshRunner.trigger;
      },
    );

    return ManamiCacheRefreshClient.of({ refreshCacheIfNeeded });
  }),
);

export const ManamiClientLive = Layer.mergeAll(
  ManamiLookupClientLayer,
  ManamiCacheRefreshClientLayer,
).pipe(Layer.provide(ManamiSqliteClientLive));

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
