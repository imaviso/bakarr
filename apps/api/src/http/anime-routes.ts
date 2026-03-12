import { Effect } from "effect";
import type { Hono } from "hono";

import type {
  Anime,
  AnimeSearchResult,
  Episode,
  VideoFile,
} from "../../../../packages/shared/src/index.ts";
import { AnimeService } from "../features/anime/service.ts";
import { AuthService } from "../features/auth/service.ts";
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
  StreamQuerySchema,
} from "./request-schemas.ts";
import type { AppVariables, RunEffect } from "./route-helpers.ts";
import {
  getApiKey,
  guessContentType,
  parseParams,
  parseQuery,
  runRoute,
  toAddAnimeInput,
  withJsonBody,
  withParams,
  withParamsAndBody,
  withQuery,
} from "./route-helpers.ts";

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
        Effect.flatMap(AnimeService, (service) => service.searchAnime(query.q ?? ""))
      ),
      (value: AnimeSearchResult[]) => c.json(value),
    ));

  app.get("/api/anime/anilist/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "get AniList anime", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.getAnimeByAnilistId(params.id))
      ),
      (value: AnimeSearchResult) => c.json(value),
    ));

  app.post("/api/anime", (c) => {
    return runRoute(
      c,
      runEffect,
      withJsonBody(c, AddAnimeInputSchema, "add anime", (body) =>
        Effect.flatMap(AnimeService, (service) => service.addAnime(toAddAnimeInput(body)))
      ),
      (value: Anime) => c.json(value),
    );
  });

  app.get("/api/anime/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "get anime", (params) =>
        Effect.flatMap(AnimeService, (service) => service.getAnime(params.id))
      ),
      (value: Anime) => c.json(value),
    ));

  app.delete("/api/anime/:id", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "delete anime", (params) =>
        Effect.flatMap(AnimeService, (service) => service.deleteAnime(params.id))
      ),
      () => c.json({ data: null, success: true }),
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
          Effect.flatMap(AnimeService, (service) =>
            service.setMonitored(params.id, body.monitored)
          ),
      ),
      () => c.json({ data: null, success: true }),
    );
  });

  app.put("/api/anime/:id/path", (c) => {
    return runRoute(
      c,
      runEffect,
      withParamsAndBody(c, IdParamsSchema, PathBodySchema, "update anime path", (
        params,
        body,
      ) =>
        Effect.flatMap(AnimeService, (service) => service.updatePath(params.id, body.path))
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
          Effect.flatMap(AnimeService, (service) =>
            service.updateProfile(params.id, body.profile_name)
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
          Effect.flatMap(AnimeService, (service) =>
            service.updateReleaseProfiles(params.id, [...body.release_profile_ids])
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
        Effect.flatMap(AnimeService, (service) => service.listEpisodes(params.id))
      ),
      (value: Episode[]) => c.json(value),
    ));

  app.post("/api/anime/:id/episodes/refresh", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "refresh episodes", (params) =>
        Effect.flatMap(AnimeService, (service) => service.refreshEpisodes(params.id))
      ),
      () => c.json({ data: null, success: true }),
    ));

  app.post("/api/anime/:id/episodes/scan", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, IdParamsSchema, "scan anime folder", (params) =>
        Effect.flatMap(AnimeService, (service) => service.scanFolder(params.id))
      ),
      (value) => c.json(value),
    ));

  app.delete("/api/anime/:id/episodes/:episodeNumber/file", (c) =>
    runRoute(
      c,
      runEffect,
      withParams(c, AnimeEpisodeParamsSchema, "delete episode file", (params) =>
        Effect.flatMap(AnimeService, (service) =>
          service.deleteEpisodeFile(params.id, params.episodeNumber))
      ),
      () => c.json({ data: null, success: true }),
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
          Effect.flatMap(AnimeService, (service) =>
            service.mapEpisode(params.id, params.episodeNumber, body.file_path)
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
          Effect.flatMap(AnimeService, (service) =>
            service.bulkMapEpisodes(params.id, [...body.mappings])
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
        Effect.flatMap(AnimeService, (service) => service.listFiles(params.id))
      ),
      (value: VideoFile[]) => c.json(value),
    ));

  app.get("/api/stream/:id/:episodeNumber", async (c) => {
    const query = await runEffect(parseQuery(c, StreamQuerySchema, "stream episode"));
    const params = await runEffect(parseParams(c, AnimeEpisodeParamsSchema, "stream episode"));
    const apiKey = getApiKey(undefined, undefined, query.token);
    const viewer = await runEffect(
      Effect.flatMap(AuthService, (auth) => auth.resolveViewer(undefined, apiKey)),
    );

    if (!viewer) {
      return c.text("Unauthorized", 401);
    }

    const files = await runEffect(
      Effect.flatMap(AnimeService, (service) => service.listFiles(params.id)),
    );
    const match = files.find((file) => file.episode_number === params.episodeNumber);

    if (!match) {
      return c.text("Episode file not found", 404);
    }

    const bytes = await Deno.readFile(match.path);

    return new Response(bytes, {
      headers: {
        "Content-Disposition": `inline; filename="${match.name}"`,
        "Content-Type": guessContentType(match.name),
      },
    });
  });
}
