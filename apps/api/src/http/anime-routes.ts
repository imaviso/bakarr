import { Effect } from "effect";
import { Hono } from "hono";

import type {
  Anime,
  AnimeSearchResult,
  Episode,
  VideoFile,
} from "../../../../packages/shared/src/index.ts";
import { AnimeService } from "../features/anime/service.ts";
import { DownloadService } from "../features/operations/service.ts";
import {
  AddAnimeInputSchema,
  AnimeEpisodeParamsSchema,
  BulkEpisodeMappingsBodySchema,
  FilePathBodySchema,
  IdParamsSchema,
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
import { requireViewer } from "./route-auth.ts";

export function registerAnimeRoutes(
  app: Hono<{ Variables: AppVariables }>,
  runEffect: RunEffect,
) {
  app.get("/api/anime", (c) =>
    runRoute(
      c,
      runEffect,
      Effect.flatMap(AnimeService, (service) => service.listAnime()),
      (value: Anime[]) => c.json(value),
    ));

  app.get("/api/anime/search", (c) =>
    runRoute(
      c,
      runEffect,
      withQuery(c, SearchAnimeQuerySchema, "search anime", (query) =>
        Effect.flatMap(AnimeService, (service) =>
          service.searchAnime(query.q ?? ""))),
      (value: AnimeSearchResult[]) =>
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

  app.get("/api/anime/:id/stream-url", async (c) => {
    requireViewer(c);
    const id = parseInt(c.req.param("id"), 10);
    const episodeNumberStr = c.req.query("episodeNumber");

    if (isNaN(id) || !episodeNumberStr) return c.text("Bad request", 400);

    const episodeNumber = parseInt(episodeNumberStr, 10);
    if (isNaN(episodeNumber)) return c.text("Bad request", 400);

    const expiresAt = Date.now() + 6 * 60 * 60 * 1000; // 6 hours
    const url = await signStreamUrl(id, episodeNumber, expiresAt);
    return c.json({ url });
  });

  app.get("/api/stream/:id/:episodeNumber", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    const episodeNumber = parseInt(c.req.param("episodeNumber"), 10);
    const exp = parseInt(c.req.query("exp") || "0", 10);
    const sig = c.req.query("sig") || "";

    if (
      isNaN(id) || isNaN(episodeNumber) || !exp || !sig ||
      !(await verifyStreamUrl(id, episodeNumber, exp, sig))
    ) {
      return c.text("Forbidden or expired", 403);
    }

    const files = await runEffect(
      Effect.flatMap(AnimeService, (service) => service.listFiles(id)),
    );
    const match = files.find((file) => file.episode_number === episodeNumber);

    if (!match) {
      return c.text("Episode file not found", 404);
    }

    const stat = await Deno.stat(match.path);
    const fileSize = stat.size;
    const range = c.req.header("range");
    const contentType = guessContentType(match.name);

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
        return new Response("Requested range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const chunkSize = end - start + 1;
      const file = await Deno.open(match.path, { read: true });
      await file.seek(start, Deno.SeekMode.Start);

      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const buffer = new Uint8Array(Math.min(chunkSize, 65536));
          let remaining = chunkSize;
          try {
            while (remaining > 0) {
              const read = await file.read(
                buffer.subarray(0, Math.min(remaining, buffer.length)),
              );
              if (read === null) break;
              controller.enqueue(buffer.subarray(0, read));
              remaining -= read;
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          } finally {
            file.close();
          }
        },
        cancel() {
          file.close();
        },
      });

      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${match.name}"`,
        },
      });
    }

    const file = await Deno.open(match.path, { read: true });
    return new Response(file.readable, {
      headers: {
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${match.name}"`,
      },
    });
  });
}
