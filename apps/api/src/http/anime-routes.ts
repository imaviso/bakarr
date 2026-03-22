import { Chunk, Effect, Option, ParseResult, Schema, Stream } from "effect";
import { Hono } from "hono";

import type {
  Anime,
  AnimeListResponse,
  AnimeSearchResponse,
  AnimeSearchResult,
  Episode,
  VideoFile,
} from "../../../../packages/shared/src/index.ts";
import { AnimeService } from "../features/anime/service.ts";
import { AuthError } from "../features/auth/service.ts";
import { DownloadService } from "../features/operations/service.ts";
import { FileSystem, FileSystemError } from "../lib/filesystem.ts";
import { EpisodeStreamRangeError } from "./streaming-errors.ts";
import {
  AddAnimeInputSchema,
  AnimeEpisodeParamsSchema,
  BulkEpisodeMappingsBodySchema,
  FilePathBodySchema,
  IdParamsSchema,
  ListAnimeQuerySchema,
  MonitoredBodySchema,
  PathBodySchema,
  ProfileNameBodySchema,
  ReleaseProfileIdsBodySchema,
  SearchAnimeQuerySchema,
} from "./request-schemas.ts";
import type { AppVariables, RunEffect } from "./route-helpers.ts";
import {
  guessContentType,
  runRoute,
  toAddAnimeInput,
  withJsonBody,
  withParams,
  withParamsAndBody,
  withQuery,
} from "./route-helpers.ts";
import { requireViewerEffect } from "./route-auth.ts";

class StreamQuerySchema
  extends Schema.Class<StreamQuerySchema>("StreamQuerySchema")({
    exp: Schema.NumberFromString.pipe(Schema.int(), Schema.positive()),
    sig: Schema.String.pipe(Schema.minLength(1)),
  }) {}

interface ByteRange {
  readonly end: number;
  readonly start: number;
}

const STREAM_CHUNK_SIZE = 64 * 1024;
const SEEK_FROM_START = 0;

export function registerAnimeRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runEffect: RunEffect,
) {
  app.get("/api/anime", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, ListAnimeQuerySchema, "list anime", (query) =>
        Effect.flatMap(AnimeService, (service) =>
          service.listAnime({
            limit: query.limit,
            monitored: query.monitored,
            offset: query.offset,
          }))),
      (value: AnimeListResponse) =>
        c.json(value),
    ));

  app.get("/api/anime/search", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, SearchAnimeQuerySchema, "search anime", (query) =>
        Effect.flatMap(AnimeService, (service) =>
          service.searchAnime(query.q ?? ""))),
      (value: AnimeSearchResponse) =>
        c.json(value),
    ));

  app.get("/api/anime/anilist/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "get AniList anime", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.getAnimeByAnilistId(params.id))),
      (value: AnimeSearchResult) =>
        c.json(value),
    ));

  app.post("/api/anime", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(
        c,
        AddAnimeInputSchema,
        "add anime",
        (body) =>
          Effect.gen(function* () {
            const anime = yield* Effect.flatMap(
              AnimeService,
              (service) => service.addAnime(toAddAnimeInput(body)),
            );

            if (body.monitor_and_search) {
              yield* Effect.flatMap(
                DownloadService,
                (service) => service.triggerSearchMissing(anime.id),
              );
            }

            return anime;
          }),
      ),
      (value: Anime) => c.json(value),
    );
  });

  app.get("/api/anime/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "get anime", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.getAnime(params.id))),
      (value: Anime) =>
        c.json(value),
    ));

  app.delete("/api/anime/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "delete anime", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.deleteAnime(params.id))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/anime/:id/monitor", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        IdParamsSchema,
        MonitoredBodySchema,
        "set monitored",
        (params, body) =>
          Effect.flatMap(
            AnimeService,
            (service) => service.setMonitored(params.id, body.monitored),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.put("/api/anime/:id/path", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        IdParamsSchema,
        PathBodySchema,
        "update anime path",
        (
          params,
          body,
        ) =>
          Effect.flatMap(
            AnimeService,
            (service) => service.updatePath(params.id, body.path),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.put("/api/anime/:id/profile", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        IdParamsSchema,
        ProfileNameBodySchema,
        "update anime profile",
        (params, body) =>
          Effect.flatMap(
            AnimeService,
            (service) => service.updateProfile(params.id, body.profile_name),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.put("/api/anime/:id/release-profiles", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        IdParamsSchema,
        ReleaseProfileIdsBodySchema,
        "update anime release profiles",
        (params, body) =>
          Effect.flatMap(
            AnimeService,
            (service) =>
              service.updateReleaseProfiles(params.id, [
                ...body.release_profile_ids,
              ]),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.get("/api/anime/:id/episodes", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "list anime episodes", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.listEpisodes(params.id))),
      (value: Episode[]) =>
        c.json(value),
    ));

  app.post("/api/anime/:id/episodes/refresh", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "refresh episodes", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.refreshEpisodes(params.id))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/anime/:id/episodes/scan", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "scan anime folder", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.scanFolder(params.id))),
      (value) =>
        c.json(value),
    ));

  app.delete("/api/anime/:id/episodes/:episodeNumber/file", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, AnimeEpisodeParamsSchema, "delete episode file", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.deleteEpisodeFile(params.id, params.episodeNumber))),
      () =>
        c.json({ data: null, success: true }),
    ));

  app.post("/api/anime/:id/episodes/:episodeNumber/map", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        AnimeEpisodeParamsSchema,
        FilePathBodySchema,
        "map episode",
        (params, body) =>
          Effect.flatMap(
            AnimeService,
            (service) =>
              service.mapEpisode(
                params.id,
                params.episodeNumber,
                body.file_path,
              ),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.post("/api/anime/:id/episodes/map/bulk", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(
        c,
        IdParamsSchema,
        BulkEpisodeMappingsBodySchema,
        "bulk map episodes",
        (params, body) =>
          Effect.flatMap(
            AnimeService,
            (service) => service.bulkMapEpisodes(params.id, [...body.mappings]),
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.get("/api/anime/:id/files", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "list anime files", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.listFiles(params.id))),
      (value: VideoFile[]) =>
        c.json(value),
    ));

  const STREAM_SECRET = crypto.getRandomValues(new Uint8Array(32));

  async function signStreamUrl(
    animeId: number,
    episodeNumber: number,
    expiresAt: number,
  ): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      STREAM_SECRET,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const payload = `${animeId}:${episodeNumber}:${expiresAt}`;
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload),
    );
    const signatureHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `/api/stream/${animeId}/${episodeNumber}?exp=${expiresAt}&sig=${signatureHex}`;
  }

  async function verifyStreamUrl(
    animeId: number,
    episodeNumber: number,
    expiresAt: number,
    signatureHex: string,
  ): Promise<boolean> {
    if (Date.now() > expiresAt) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      STREAM_SECRET,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const payload = `${animeId}:${episodeNumber}:${expiresAt}`;
    const signatureBuffer = new Uint8Array(
      signatureHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [],
    );
    if (signatureBuffer.length !== 32) return false;

    return crypto.subtle.verify(
      "HMAC",
      key,
      signatureBuffer,
      new TextEncoder().encode(payload),
    );
  }

  app.get("/api/anime/:id/stream-url", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.gen(function* () {
        yield* requireViewerEffect(c);
        const id = parseInt(c.req.param("id"), 10);
        const episodeNumberStr = c.req.query("episodeNumber");

        if (isNaN(id) || !episodeNumberStr) {
          return yield* new AuthError({
            message: "Bad request",
            status: 400,
          });
        }

        const episodeNumber = parseInt(episodeNumberStr, 10);
        if (isNaN(episodeNumber)) {
          return yield* new AuthError({
            message: "Bad request",
            status: 400,
          });
        }

        const expiresAt = Date.now() + 6 * 60 * 60 * 1000;
        const url = yield* Effect.tryPromise({
          try: () => signStreamUrl(id, episodeNumber, expiresAt),
          catch: () =>
            new AuthError({
              message: "Failed to sign stream URL",
              status: 400,
            }),
        });

        return { url };
      }),
      (value) => c.json(value),
    ));

  app.get("/api/stream/:id/:episodeNumber", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.gen(function* () {
        const params = yield* decodeRequestInput(
          AnimeEpisodeParamsSchema,
          {
            episodeNumber: c.req.param("episodeNumber"),
            id: c.req.param("id"),
          },
          "stream episode",
        );
        const query = yield* decodeRequestInput(
          StreamQuerySchema,
          {
            exp: c.req.query("exp") ?? "",
            sig: c.req.query("sig") ?? "",
          },
          "stream episode",
        );

        const isAuthorized = yield* Effect.tryPromise({
          try: () =>
            verifyStreamUrl(
              params.id,
              params.episodeNumber,
              query.exp,
              query.sig,
            ),
          catch: (cause) =>
            new AuthError({
              message: cause instanceof Error
                ? cause.message
                : "Forbidden or expired",
              status: 403,
            }),
        });

        if (!isAuthorized) {
          return yield* new AuthError({
            message: "Forbidden or expired",
            status: 403,
          });
        }

        const resolvedEpisodeFile = yield* Effect.flatMap(
          AnimeService,
          (service) =>
            service.resolveEpisodeFile(params.id, params.episodeNumber),
        );

        if (!resolvedEpisodeFile) {
          return yield* new AuthError({
            message: "Episode file not found",
            status: 404,
          });
        }

        const fs = yield* FileSystem;
        const fileInfo = yield* fs.stat(resolvedEpisodeFile.filePath).pipe(
          Effect.mapError(() =>
            new AuthError({
              message: "Episode file not found",
              status: 404,
            })
          ),
        );
        const byteRange = yield* parseByteRange(
          c.req.header("range"),
          fileInfo.size,
        );

        return {
          contentLength: byteRange
            ? byteRange.end - byteRange.start + 1
            : fileInfo.size,
          contentType: guessContentType(resolvedEpisodeFile.fileName),
          fileName: resolvedEpisodeFile.fileName,
          fileSize: fileInfo.size,
          fs,
          filePath: resolvedEpisodeFile.filePath,
          range: byteRange,
          status: byteRange ? 206 : 200,
        };
      }),
      (value) =>
        new Response(
          createFileReadableStream(value.fs, value.filePath, value.range),
          {
            status: value.status,
            headers: {
              ...(value.range
                ? {
                  "Content-Range":
                    `bytes ${value.range.start}-${value.range.end}/${value.fileSize}`,
                }
                : {}),
              "Accept-Ranges": "bytes",
              "Content-Length": value.contentLength.toString(),
              "Content-Type": value.contentType,
              "Content-Disposition": `inline; filename="${value.fileName}"`,
            },
          },
        ),
    ));
}

function decodeRequestInput<A, I, R>(
  schema: Schema.Schema<A, I, R>,
  input: I,
  subject: string,
): Effect.Effect<A, AuthError | ParseResult.ParseError, R> {
  if (input === undefined || input === null) {
    return Effect.fail(
      new AuthError({
        message: `Invalid request for ${subject}`,
        status: 403,
      }),
    );
  }

  return Schema.decodeUnknown(schema)(input).pipe(
    Effect.mapError((error) =>
      ParseResult.isParseError(error)
        ? new AuthError({
          message: `Invalid request for ${subject}`,
          status: subject === "stream episode" ? 403 : 400,
        })
        : error
    ),
  );
}

function parseByteRange(
  rangeHeader: string | undefined,
  fileSize: number,
): Effect.Effect<ByteRange | undefined, EpisodeStreamRangeError> {
  if (!rangeHeader) {
    return Effect.void.pipe(Effect.as(undefined));
  }

  const match = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader.trim());

  if (!match) {
    return Effect.fail(
      new EpisodeStreamRangeError({
        fileSize,
        message: "Requested range not satisfiable",
        status: 416,
      }),
    );
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : fileSize - 1;

  if (
    Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start ||
    start >= fileSize || end >= fileSize
  ) {
    return Effect.fail(
      new EpisodeStreamRangeError({
        fileSize,
        message: "Requested range not satisfiable",
        status: 416,
      }),
    );
  }

  return Effect.succeed({ end, start });
}

function createFileReadableStream(
  fs: typeof FileSystem.Service,
  path: string,
  range: ByteRange | undefined,
): ReadableStream<Uint8Array> {
  return Stream.toReadableStream<Uint8Array>({})(
    createFileChunkStream(fs, path, range),
  );
}

function createFileChunkStream(
  fs: typeof FileSystem.Service,
  path: string,
  range: ByteRange | undefined,
): Stream.Stream<Uint8Array, FileSystemError> {
  const initialRange = range ?? { end: Number.MAX_SAFE_INTEGER, start: 0 };

  return Stream.unwrapScoped(
    Effect.map(
      fs.openFile(path, { read: true }),
      (file) =>
        Stream.paginateChunkEffect(
          initialRange,
          (current) =>
            Effect.gen(function* () {
              const requestedLength = range
                ? Math.min(STREAM_CHUNK_SIZE, current.end - current.start + 1)
                : STREAM_CHUNK_SIZE;
              const buffer = new Uint8Array(requestedLength);

              yield* file.seek(current.start, SEEK_FROM_START);
              const read = yield* file.read(buffer);

              if (read === null || read === 0) {
                return [
                  Chunk.empty<Uint8Array>(),
                  Option.none<ByteRange>(),
                ] as const;
              }

              const nextStart = current.start + read;

              return [
                Chunk.of(buffer.subarray(0, read)),
                range && nextStart > current.end
                  ? Option.none<ByteRange>()
                  : Option.some({
                    ...current,
                    start: nextStart,
                  }),
              ] as const;
            }),
        ),
    ),
  );
}
