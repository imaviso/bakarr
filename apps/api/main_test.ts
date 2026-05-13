import assert from "node:assert/strict";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { it } from "@effect/vitest";
import { CommandExecutor } from "@effect/platform";
import { HttpApp } from "@effect/platform";
import * as Context from "effect/Context";
import { Effect, Layer, ManagedRuntime, Option, Schema, Stream } from "effect";
import * as Exit from "effect/Exit";
import * as EffectLayer from "effect/Layer";
import * as Scope from "effect/Scope";
import { AsyncOperationAcceptedSchema, OperationTaskSchema } from "@packages/shared/index.ts";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapProgram } from "./src/app/startup.ts";
import { makeApiLifecycleLayers } from "./src/app/lifecycle-layers.ts";
import { createHttpApp } from "./src/http/http-app.ts";
import { commandArgs, commandName } from "./src/test/stubs.ts";
import { AniListClient } from "./src/features/anime/anilist.ts";
import { JikanClient } from "./src/features/anime/jikan.ts";
import { ManamiClient } from "./src/features/anime/manami.ts";
import {
  mapQBitState,
  type QBitTorrent,
  QBitTorrentClient,
} from "./src/features/operations/qbittorrent.ts";
import { RssClient } from "./src/features/operations/rss-client.ts";
import type { ParsedRelease } from "./src/features/operations/rss-client-parse.ts";
import { SeaDexClient, type SeaDexEntry } from "./src/features/operations/seadex-client.ts";
import type { AnimeSearchResult } from "../../packages/shared/src/index.ts";

declare global {
  interface Response {
    json<T = any>(): Promise<T>;
  }
}

type TestContextOptions = {
  readonly jikanLayer?: Layer.Layer<JikanClient>;
  readonly manamiLayer?: Layer.Layer<ManamiClient>;
  readonly qbitLayer?: Layer.Layer<QBitTorrentClient>;
  readonly rssLayer?: Layer.Layer<RssClient>;
  readonly seadexLayer?: Layer.Layer<SeaDexClient>;
};

type TestContext = Awaited<ReturnType<typeof createTestContext>>;
type EventsReader = {
  readonly read: () => Promise<{ readonly done: boolean; readonly value?: Uint8Array }>;
  readonly cancel: () => Promise<void>;
};

const withTestContextEffect = Effect.fn("Test.withTestContextEffect")(function* <A, E, R>(input: {
  readonly options?: TestContextOptions;
  readonly run: (ctx: TestContext) => Effect.Effect<A, E, R>;
}) {
  return yield* Effect.acquireUseRelease(
    Effect.tryPromise(() => createTestContext(input.options)),
    input.run,
    (ctx) => Effect.promise(() => ctx.dispose()),
  );
});

const withTempDirEffect = Effect.fn("Test.withTempDirEffect")(function* <A, E, R>(
  run: (path: string) => Effect.Effect<A, E, R>,
) {
  return yield* Effect.acquireUseRelease(
    Effect.tryPromise(() => makeTempDir()),
    run,
    (path) => Effect.promise(() => removePath(path, { recursive: true })),
  );
});

function itWithTestContext(
  name: string,
  run: (ctx: TestContext) => PromiseLike<void> | void,
  options?: TestContextOptions,
) {
  return it.scoped(name, () => {
    const input = {
      ...(options === undefined ? {} : { options }),
      run: (ctx: TestContext) => Effect.tryPromise(() => Promise.resolve(run(ctx))),
    };

    return withTestContextEffect(input);
  });
}

async function withTempDir<A>(run: (path: string) => PromiseLike<A> | A): Promise<A> {
  return await Effect.runPromise(
    Effect.scoped(withTempDirEffect((path) => Effect.tryPromise(() => Promise.resolve(run(path))))),
  );
}

async function loginAsBootstrapAdmin(ctx: TestContext) {
  const loginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "admin", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const sessionCookie = loginResponse.headers.get("set-cookie");

  assert(sessionCookie);

  return { loginResponse, sessionCookie };
}

async function withEventsStreamReader<A>(
  ctx: TestContext,
  sessionCookie: string,
  run: (reader: EventsReader) => PromiseLike<A> | A,
): Promise<A> {
  const eventsResponse = await ctx.app.request("/api/events", {
    headers: { Cookie: sessionCookie },
  });

  assert.deepStrictEqual(eventsResponse["status"], 200);
  assert.match(eventsResponse.headers.get("content-type") ?? "", /^application\/x-ndjson/);
  assert(eventsResponse.body);

  const reader = eventsResponse.body.getReader();
  const eventsReader: EventsReader = {
    cancel: () => reader.cancel(),
    read: () => reader.read(),
  };

  try {
    return await run(eventsReader);
  } finally {
    await eventsReader.cancel().catch(() => undefined);
  }
}

const NARUTO_RELEASE_TITLE = "[SubsPlease] Naruto - 01 (1080p) [ABC123].mkv";

itWithTestContext("GET /health returns ok", async (ctx) => {
  const response = await ctx.app.request("/health");

  assert.deepStrictEqual(response["status"], 200);
  assert.deepStrictEqual(await response.json(), { status: "ok" });
});

itWithTestContext("search releases enriches SeaDex metadata using AniList ID", async (ctx) => {
  const loginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "admin", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const sessionCookie = loginResponse.headers.get("set-cookie");
  assert(sessionCookie);

  await withTempDir(async (baseRoot) => {
    const addResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: baseRoot,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(addResponse["status"], 200);

    const response = await ctx.app.request("/api/search/releases?query=Naruto&anime_id=20", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual(response["status"], 200);

    const body = await response.json();
    assert.deepStrictEqual(body.seadex_groups, ["SubsPlease"]);
    assert.deepStrictEqual(body.results.length, 1);
    assert.deepStrictEqual(body.results[0].is_seadex, true);
    assert.deepStrictEqual(body.results[0].is_seadex_best, true);
    assert.deepStrictEqual(body.results[0].seadex_release_group, "SubsPlease");
    assert.deepStrictEqual(
      body.results[0].seadex_comparison,
      "https://releases.moe/compare/naruto",
    );
    assert.deepStrictEqual(
      body.results[0].seadex_notes,
      "Prefer the SeaDex best release when available.",
    );
    assert.deepStrictEqual(body.results[0].seadex_tags, ["Best", "Dual Audio"]);
    assert.deepStrictEqual(body.results[0].seadex_dual_audio, true);
  });
});

it.scoped("search releases can match SeaDex by Nyaa URL when info hash is unavailable", () => {
  const seadexLayer = Layer.succeed(SeaDexClient, {
    getEntryByAniListId: (_aniListId: number) =>
      Effect.succeed(
        Option.some({
          alID: 20,
          comparison: "https://releases.moe/compare/naruto-url",
          incomplete: false,
          notes: "Matched by Nyaa URL fallback.",
          releases: [
            {
              dualAudio: false,
              groupedUrl: "https://releases.moe/collections/naruto-url",
              infoHash: undefined,
              isBest: false,
              releaseGroup: "OtherGroup",
              tags: ["Alt"],
              tracker: "Nyaa",
              url: "https://nyaa.si/download/7891011.torrent",
            },
          ],
        }),
      ),
  });
  const rssLayer = Layer.succeed(RssClient, {
    fetchItems: (_url: string) =>
      Effect.succeed([
        makeTestRelease("[MysteryGroup] Naruto - 01 (1080p)", {
          group: "MysteryGroup",
          infoHash: "",
          viewUrl: "https://nyaa.si/view/7891011",
        }),
      ]),
  });
  return withTestContextEffect({
    options: { rssLayer, seadexLayer },
    run: (ctx) =>
      Effect.tryPromise(async () => {
        const loginResponse = await ctx.app.request("/api/auth/login", {
          body: JSON.stringify({ password: "admin", username: "admin" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const sessionCookie = loginResponse.headers.get("set-cookie");
        assert(sessionCookie);

        await withTempDir(async (baseRoot) => {
          const addResponse = await ctx.app.request("/api/anime", {
            body: JSON.stringify({
              id: 20,
              monitor_and_search: false,
              monitored: true,
              profile_name: "Default",
              release_profile_ids: [],
              root_folder: baseRoot,
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          });
          assert.deepStrictEqual(addResponse["status"], 200);

          const response = await ctx.app.request("/api/search/releases?query=Naruto&anime_id=20", {
            headers: { Cookie: sessionCookie },
          });
          assert.deepStrictEqual(response["status"], 200);

          const body = await response.json();
          assert.deepStrictEqual(body.results[0].is_seadex, true);
          assert.deepStrictEqual(body.results[0].is_seadex_best, false);
          assert.deepStrictEqual(
            body.results[0].seadex_comparison,
            "https://releases.moe/compare/naruto-url",
          );
          assert.deepStrictEqual(body.results[0].seadex_notes, "Matched by Nyaa URL fallback.");
        });
      }),
  });
});

it.scoped("search releases only marks matching groups as SeaDex in fallback matching", () => {
  const seadexLayer = Layer.succeed(SeaDexClient, {
    getEntryByAniListId: (_aniListId: number) =>
      Effect.succeed(
        Option.some({
          alID: 20,
          comparison: "https://releases.moe/compare/yofukashi",
          incomplete: false,
          notes: "Okay-Subs is the recommended release.",
          releases: [
            {
              dualAudio: false,
              groupedUrl: "https://releases.moe/collections/yofukashi",
              infoHash: undefined,
              isBest: true,
              releaseGroup: "Okay-Subs",
              tags: ["Best"],
              tracker: "Nyaa",
              url: "https://nyaa.si/view/999999",
            },
          ],
        }),
      ),
  });
  const rssLayer = Layer.succeed(RssClient, {
    fetchItems: (_url: string) =>
      Effect.succeed([
        makeTestRelease("[Okay-Subs] Yofukashi no Uta S2 - 12 [1080p]", {
          group: "Okay-Subs",
          infoHash: "",
          viewUrl: "https://nyaa.si/view/111111",
        }),
        makeTestRelease("[EMBER] Yofukashi no Uta S2 - 12 [1080p]", {
          group: "EMBER",
          infoHash: "",
          viewUrl: "https://nyaa.si/view/222222",
        }),
      ]),
  });
  return withTestContextEffect({
    options: { rssLayer, seadexLayer },
    run: (ctx) =>
      Effect.tryPromise(async () => {
        const loginResponse = await ctx.app.request("/api/auth/login", {
          body: JSON.stringify({ password: "admin", username: "admin" }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const sessionCookie = loginResponse.headers.get("set-cookie");
        assert(sessionCookie);

        await withTempDir(async (baseRoot) => {
          const addResponse = await ctx.app.request("/api/anime", {
            body: JSON.stringify({
              id: 20,
              monitor_and_search: false,
              monitored: true,
              profile_name: "Default",
              release_profile_ids: [],
              root_folder: baseRoot,
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          });
          assert.deepStrictEqual(addResponse["status"], 200);

          const response = await ctx.app.request(
            "/api/search/releases?query=Yofukashi%20no%20Uta&anime_id=20",
            { headers: { Cookie: sessionCookie } },
          );
          assert.deepStrictEqual(response["status"], 200);

          const body = await response.json();
          assert.deepStrictEqual(body.results.length, 2);

          const okaySubs = body.results.find((result: { title: string }) =>
            result.title.includes("Okay-Subs"),
          );
          const ember = body.results.find((result: { title: string }) =>
            result.title.includes("EMBER"),
          );

          assert.deepStrictEqual(okaySubs?.is_seadex, true);
          assert.deepStrictEqual(okaySubs?.is_seadex_best, true);
          assert.deepStrictEqual(ember?.is_seadex, false);
          assert.deepStrictEqual(ember?.is_seadex_best, false);
        });
      }),
  });
});

itWithTestContext("episode search includes SeaDex metadata in ranked results", async (ctx) => {
  const loginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "admin", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const sessionCookie = loginResponse.headers.get("set-cookie");
  assert(sessionCookie);

  await withTempDir(async (baseRoot) => {
    const addResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: baseRoot,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(addResponse["status"], 200);

    const response = await ctx.app.request("/api/search/episode/20/1", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual(response["status"], 200);

    const body = await response.json();
    assert.deepStrictEqual(body.length, 1);
    assert.deepStrictEqual(body[0].is_seadex, true);
    assert.deepStrictEqual(body[0].is_seadex_best, true);
    assert.deepStrictEqual(body[0].seadex_comparison, "https://releases.moe/compare/naruto");
    assert.deepStrictEqual(body[0].seadex_dual_audio, true);
    assert.deepStrictEqual(body[0].seadex_notes, "Prefer the SeaDex best release when available.");
    assert.deepStrictEqual(body[0].seadex_tags, ["Best", "Dual Audio"]);
    assert.deepStrictEqual(body[0].download_action.Accept?.is_seadex_best, true);
  });
});

itWithTestContext("cached anime images are served from the image store", async (ctx) => {
  const loginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "admin", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const sessionCookie = loginResponse.headers.get("set-cookie");
  assert(sessionCookie);

  await withTempDir(async (imagesPath) => {
    const currentConfigResponse = await ctx.app.request("/api/system/config", {
      headers: { Cookie: sessionCookie },
    });
    const currentConfig = await currentConfigResponse.json();

    await ctx.app.request("/api/system/config", {
      body: JSON.stringify({
        ...currentConfig,
        general: {
          ...currentConfig.general,
          images_path: imagesPath,
        },
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    await mkdirPath(`${imagesPath}/anime/20`, { recursive: true });
    const body = new TextEncoder().encode("cached-image");
    await writeBinaryFile(`${imagesPath}/anime/20/cover.png`, body);

    const response = await ctx.app.request("/api/images/anime/20/cover.png", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(response["status"], 200);
    assert.deepStrictEqual(response.headers.get("content-type"), "image/png");
    assert.deepStrictEqual(await response.text(), "cached-image");
  });
});

itWithTestContext(
  "bootstrap admin can log in and read auth/session protected endpoints",
  async (ctx) => {
    const loginResponse = await ctx.app.request("/api/auth/login", {
      body: JSON.stringify({ password: "admin", username: "admin" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    assert.deepStrictEqual(loginResponse["status"], 200);

    const loginBody = await loginResponse.json();
    const sessionCookie = loginResponse.headers.get("set-cookie");

    assert(sessionCookie);
    assert.deepStrictEqual(loginBody.username, "admin");
    assert.deepStrictEqual(loginBody.must_change_password, true);
    assert.match(loginBody.api_key, /^\*+$/);

    const meResponse = await ctx.app.request("/api/auth/me", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(meResponse["status"], 200);

    const me = await meResponse.json();

    assert.deepStrictEqual(me.username, "admin");
    assert(typeof me.id === "number");

    const configResponse = await ctx.app.request("/api/system/config", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(configResponse["status"], 200);

    const config = await configResponse.json();

    assert.deepStrictEqual(config.general.database_path, ctx.databaseFile);
    assert.deepStrictEqual(config.profiles.length, 1);

    const statsResponse = await ctx.app.request("/api/library/stats", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(statsResponse["status"], 200);
    assert.deepStrictEqual(await statsResponse.json(), {
      downloaded_episodes: 0,
      downloaded_percent: 0,
      missing_episodes: 0,
      monitored_anime: 0,
      recent_downloads: 0,
      rss_feeds: 0,
      total_anime: 0,
      total_episodes: 0,
      up_to_date_anime: 0,
    });
  },
);

itWithTestContext("auth password change and logout flow works", async (ctx) => {
  const loginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "admin", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const sessionCookie = loginResponse.headers.get("set-cookie");
  assert(sessionCookie);

  const changePasswordResponse = await ctx.app.request("/api/auth/password", {
    body: JSON.stringify({
      current_password: "admin",
      new_password: "bakarr123",
    }),
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
    },
    method: "PUT",
  });

  assert.deepStrictEqual(changePasswordResponse["status"], 200);

  const logoutResponse = await ctx.app.request("/api/auth/logout", {
    headers: { Cookie: sessionCookie },
    method: "POST",
  });

  assert.deepStrictEqual(logoutResponse["status"], 200);

  const meAfterLogout = await ctx.app.request("/api/auth/me", {
    headers: { Cookie: sessionCookie },
  });

  assert.deepStrictEqual(meAfterLogout["status"], 401);

  const reloginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "bakarr123", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  assert.deepStrictEqual(reloginResponse["status"], 200);

  const reloginBody = await reloginResponse.json();
  assert.deepStrictEqual(reloginBody.must_change_password, false);
});

itWithTestContext("system config update can repair corrupt stored config rows", async (ctx) => {
  const loginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "admin", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const sessionCookie = loginResponse.headers.get("set-cookie");
  assert(sessionCookie);

  const configResponse = await ctx.app.request("/api/system/config", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(configResponse["status"], 200);
  const validConfig = await configResponse.json();

  const client = createClient({ url: `file:${ctx.databaseFile}` });

  try {
    await client.execute({
      sql: "update app_config set data = ? where id = 1",
      args: ["{"],
    });
    await client.execute({
      sql: "update quality_profiles set allowed_qualities = ? where name = ?",
      args: ["{", "Default"],
    });
  } finally {
    client.close();
  }

  const brokenConfigResponse = await ctx.app.request("/api/system/config", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(brokenConfigResponse["status"], 500);

  const repairResponse = await ctx.app.request("/api/system/config", {
    body: JSON.stringify(validConfig),
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
    },
    method: "PUT",
  });
  assert.deepStrictEqual(repairResponse["status"], 200);

  const repairedConfigResponse = await ctx.app.request("/api/system/config", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(repairedConfigResponse["status"], 200);
  const repairedConfig = await repairedConfigResponse.json();
  assert.deepStrictEqual(repairedConfig.general.database_path, ctx.databaseFile);
  assert.deepStrictEqual(repairedConfig.profiles[0]?.name, "Default");
});

itWithTestContext("auth API key regeneration and API key login work", async (ctx) => {
  const loginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "admin", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  const sessionCookie = loginResponse.headers.get("set-cookie");
  assert(sessionCookie);

  const maskedKeyResponse = await ctx.app.request("/api/auth/api-key", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(maskedKeyResponse["status"], 200);
  const maskedKey = await maskedKeyResponse.json();
  assert.match(maskedKey.api_key, /^\*+$/);

  const regenerateResponse = await ctx.app.request("/api/auth/api-key/regenerate", {
    headers: { Cookie: sessionCookie },
    method: "POST",
  });
  assert.deepStrictEqual(regenerateResponse["status"], 200);
  const regenerated = await regenerateResponse.json();
  assert.match(regenerated.api_key, /^[a-f0-9]{48}$/);

  const apiKeyLoginResponse = await ctx.app.request("/api/auth/login/api-key", {
    body: JSON.stringify({ api_key: regenerated.api_key }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  assert.deepStrictEqual(apiKeyLoginResponse["status"], 200);
  const apiKeyLoginBody = await apiKeyLoginResponse.json();
  assert.deepStrictEqual(apiKeyLoginBody.username, "admin");
  assert.match(apiKeyLoginBody.api_key, /^\*+$/);

  const apiKeySessionCookie = apiKeyLoginResponse.headers.get("set-cookie");
  assert(apiKeySessionCookie);

  const meResponse = await ctx.app.request("/api/auth/me", {
    headers: { Cookie: apiKeySessionCookie },
  });

  assert.deepStrictEqual(meResponse["status"], 200);
  const me = await meResponse.json();
  assert.deepStrictEqual(me.username, "admin");
});

itWithTestContext("library browse returns sorted entries and sizes", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (root) => {
    const configRes = await ctx.app.request("/api/system/config", {
      headers: { Cookie: sessionCookie },
    });
    const config = await configRes.json();
    config.library.library_path = root;
    await ctx.app.request("/api/system/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie },
      body: JSON.stringify(config),
    });

    await mkdirPath(`${root}/anime`, { recursive: true });
    await writeTextFile(`${root}/notes.txt`, "hello");

    const browseResponse = await ctx.app.request(
      `/api/library/browse?path=${encodeURIComponent(root)}`,
      { headers: { Cookie: sessionCookie } },
    );

    assert.deepStrictEqual(browseResponse["status"], 200);
    const browse = await browseResponse.json();

    assert.deepStrictEqual(browse.current_path, root);
    assert.deepStrictEqual(browse.parent_path, root.split("/").slice(0, -1).join("/") || "/");
    assert.deepStrictEqual(browse.entries.length, 2);
    assert.deepStrictEqual(browse.entries[0].name, "anime");
    assert.deepStrictEqual(browse.entries[0].is_directory, true);
    assert.deepStrictEqual(browse.entries[1].name, "notes.txt");
    assert.deepStrictEqual(browse.entries[1].is_directory, false);
    assert.deepStrictEqual(browse.entries[1].size, 5);
    assert.deepStrictEqual(browse.total, 2);
    assert.deepStrictEqual(browse.limit, 2);
    assert.deepStrictEqual(browse.offset, 0);
    assert.deepStrictEqual(browse.has_more, false);

    const browseWithPagination = await ctx.app.request(
      `/api/library/browse?path=${encodeURIComponent(root)}&limit=1&offset=1`,
      { headers: { Cookie: sessionCookie } },
    );
    assert.deepStrictEqual(browseWithPagination["status"], 200);
    const paged = await browseWithPagination.json();
    assert.deepStrictEqual(paged.entries.length, 1);
    assert.deepStrictEqual(paged.entries[0].name, "notes.txt");
    assert.deepStrictEqual(paged.total, 2);
    assert.deepStrictEqual(paged.limit, 1);
    assert.deepStrictEqual(paged.offset, 1);
    assert.deepStrictEqual(paged.has_more, false);
  });
});

itWithTestContext("auth rejects invalid credentials and wrong password changes", async (ctx) => {
  const badLoginResponse = await ctx.app.request("/api/auth/login", {
    body: JSON.stringify({ password: "wrong", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  assert.deepStrictEqual(badLoginResponse["status"], 401);
  assert.deepStrictEqual(await badLoginResponse.text(), "Invalid username or password");

  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  const badApiKeyLogin = await ctx.app.request("/api/auth/login/api-key", {
    body: JSON.stringify({ api_key: "not-a-real-key" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  assert.deepStrictEqual(badApiKeyLogin["status"], 401);
  assert.deepStrictEqual(await badApiKeyLogin.text(), "Invalid API key");

  const badChangePassword = await ctx.app.request("/api/auth/password", {
    body: JSON.stringify({
      current_password: "wrong",
      new_password: "new-password-123",
    }),
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
    },
    method: "PUT",
  });

  assert.deepStrictEqual(badChangePassword["status"], 401);
  assert.deepStrictEqual(await badChangePassword.text(), "Current password is incorrect");
});

itWithTestContext("quality and release profile CRUD works", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  const qualitiesResponse = await ctx.app.request("/api/profiles/qualities", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(qualitiesResponse["status"], 200);
  const qualities = await qualitiesResponse.json();
  assert.deepStrictEqual(Array.isArray(qualities), true);
  assert.deepStrictEqual(qualities.length > 0, true);

  const createProfileResponse = await ctx.app.request("/api/profiles", {
    body: JSON.stringify({
      allowed_qualities: ["1080p", "720p"],
      cutoff: "1080p",
      max_size: "4GB",
      min_size: "700MB",
      name: "Custom Test",
      seadex_preferred: false,
      upgrade_allowed: true,
    }),
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  assert.deepStrictEqual(createProfileResponse["status"], 200);

  const profilesAfterCreate = await ctx.app.request("/api/profiles", {
    headers: { Cookie: sessionCookie },
  });
  const createdProfiles = await profilesAfterCreate.json();
  assert.deepStrictEqual(
    createdProfiles.some((profile: { name: string }) => profile.name === "Custom Test"),
    true,
  );

  const updateProfileResponse = await ctx.app.request("/api/profiles/Custom%20Test", {
    body: JSON.stringify({
      allowed_qualities: ["1080p"],
      cutoff: "1080p",
      max_size: null,
      min_size: null,
      name: "Custom Test",
      seadex_preferred: true,
      upgrade_allowed: false,
    }),
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
    },
    method: "PUT",
  });
  assert.deepStrictEqual(updateProfileResponse["status"], 200);

  const profilesAfterUpdate = await ctx.app.request("/api/profiles", {
    headers: { Cookie: sessionCookie },
  });
  const updatedProfiles = await profilesAfterUpdate.json();
  const updatedProfile = updatedProfiles.find(
    (profile: { name: string }) => profile.name === "Custom Test",
  );
  assert(updatedProfile);
  assert.deepStrictEqual(updatedProfile.upgrade_allowed, false);
  assert.deepStrictEqual(updatedProfile.seadex_preferred, true);

  const createReleaseProfileResponse = await ctx.app.request("/api/release-profiles", {
    body: JSON.stringify({
      enabled: true,
      is_global: false,
      name: "Release Test",
      rules: [{ rule_type: "preferred", score: 10, term: "SubsPlease" }],
    }),
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  assert.deepStrictEqual(createReleaseProfileResponse["status"], 200);
  const createdReleaseProfile = await createReleaseProfileResponse.json();
  assert.deepStrictEqual(createdReleaseProfile.name, "Release Test");

  const updateReleaseProfileResponse = await ctx.app.request(
    `/api/release-profiles/${createdReleaseProfile.id}`,
    {
      body: JSON.stringify({
        enabled: false,
        is_global: true,
        name: "Release Test Updated",
        rules: [{ rule_type: "must", score: 0, term: "Dual Audio" }],
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "PUT",
    },
  );
  assert.deepStrictEqual(updateReleaseProfileResponse["status"], 200);

  const releaseProfilesAfterUpdate = await ctx.app.request("/api/release-profiles", {
    headers: { Cookie: sessionCookie },
  });
  const releaseProfiles = await releaseProfilesAfterUpdate.json();
  const updatedReleaseProfile = releaseProfiles.find(
    (profile: { id: number }) => profile.id === createdReleaseProfile.id,
  );
  assert(updatedReleaseProfile);
  assert.deepStrictEqual(updatedReleaseProfile.name, "Release Test Updated");
  assert.deepStrictEqual(updatedReleaseProfile.enabled, false);
  assert.deepStrictEqual(updatedReleaseProfile.is_global, true);

  const deleteReleaseProfileResponse = await ctx.app.request(
    `/api/release-profiles/${createdReleaseProfile.id}`,
    {
      headers: { Cookie: sessionCookie },
      method: "DELETE",
    },
  );
  assert.deepStrictEqual(deleteReleaseProfileResponse["status"], 200);

  const deleteProfileResponse = await ctx.app.request("/api/profiles/Custom%20Test", {
    headers: { Cookie: sessionCookie },
    method: "DELETE",
  });
  assert.deepStrictEqual(deleteProfileResponse["status"], 200);

  const finalProfiles = await ctx.app.request("/api/profiles", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(
    (await finalProfiles.json()).some(
      (profile: { name: string }) => profile.name === "Custom Test",
    ),
    false,
  );

  const finalReleaseProfiles = await ctx.app.request("/api/release-profiles", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(
    (await finalReleaseProfiles.json()).some(
      (profile: { id: number }) => profile.id === createdReleaseProfile.id,
    ),
    false,
  );
});

itWithTestContext("system library scan task maps files across anime roots", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (baseRoot) => {
    const addResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: baseRoot,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(addResponse["status"], 200);
    const anime = await addResponse.json();

    const filePath = `${anime.root_folder}/Naruto - 001.mkv`;
    await writeTextFile(filePath, "video");

    const scanTaskResponse = await ctx.app.request("/api/system/tasks/scan", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    const acceptedScanTask = await expectAcceptedTaskResponse(scanTaskResponse);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedScanTask.task_id,
    });

    const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual(episodesResponse["status"], 200);
    const episodeRows = await episodesResponse.json();
    assert.deepStrictEqual(
      episodeRows.some(
        (episode: { downloaded: boolean; number: number; file_path?: string }) =>
          episode.number === 1 && episode.downloaded && episode.file_path === filePath,
      ),
      true,
    );
  });
});

itWithTestContext("system health, log export, log clear, and image fallbacks work", async (ctx) => {
  const liveResponse = await ctx.app.request("/api/system/health/live");
  assert.deepStrictEqual(liveResponse["status"], 200);
  assert.deepStrictEqual(await liveResponse.json(), { status: "alive" });

  const readyResponse = await ctx.app.request("/api/system/health/ready");
  assert.deepStrictEqual(readyResponse["status"], 200);
  assert.deepStrictEqual(await readyResponse.json(), {
    checks: { database: true },
    ready: true,
  });

  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  const logsBeforeClear = await ctx.app.request("/api/system/logs", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(logsBeforeClear["status"], 200);
  const logsBody = await logsBeforeClear.json();
  assert.deepStrictEqual(logsBody.logs.length > 0, true);

  const exportJsonResponse = await ctx.app.request("/api/system/logs/export?format=json", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(exportJsonResponse["status"], 200);
  assert.deepStrictEqual(
    exportJsonResponse.headers.get("content-type"),
    "application/json; charset=utf-8",
  );
  const exportedLogs = JSON.parse(await exportJsonResponse.text());
  assert.deepStrictEqual(Array.isArray(exportedLogs), true);
  assert.deepStrictEqual(exportedLogs.length > 0, true);

  const unauthorizedImageResponse = await ctx.app.request("/api/images/anime/999/cover.png");
  assert.deepStrictEqual(unauthorizedImageResponse["status"], 401);

  const missingImageResponse = await ctx.app.request("/api/images/anime/999/cover.png", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(missingImageResponse["status"], 500);

  const traversalImageResponse = await ctx.app.request("/api/images/../secrets.txt", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(traversalImageResponse["status"], 404);

  const clearLogsResponse = await ctx.app.request("/api/system/logs", {
    headers: { Cookie: sessionCookie },
    method: "DELETE",
  });
  assert.deepStrictEqual(clearLogsResponse["status"], 200);

  const logsAfterClear = await ctx.app.request("/api/system/logs", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(logsAfterClear["status"], 200);
  assert.deepStrictEqual((await logsAfterClear.json()).logs.length, 0);
});

itWithTestContext("unmapped scan task updates job state for discovered folders", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (libraryPath) => {
    await mkdirPath(`${libraryPath}/Alpha Archive`, { recursive: true });
    await mkdirPath(`${libraryPath}/Beta Archive`, { recursive: true });

    const currentConfigResponse = await ctx.app.request("/api/system/config", {
      headers: { Cookie: sessionCookie },
    });
    const currentConfig = await currentConfigResponse.json();

    await ctx.app.request("/api/system/config", {
      body: JSON.stringify({
        ...currentConfig,
        library: {
          ...currentConfig.library,
          library_path: libraryPath,
        },
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    const scanResponse = await ctx.app.request("/api/library/unmapped/scan", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    const acceptedFirstScan = await expectAcceptedTaskResponse(scanResponse);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedFirstScan.task_id,
    });

    const client = createClient({ url: `file:${ctx.databaseFile}` });

    try {
      await waitForSql(
        client,
        "select count(*) as value from unmapped_folder_matches where match_status = 'done'",
        [],
        (rows) => Number(rows[0]?.["value"] ?? 0) >= 1,
      );

      const firstStateResponse = await ctx.app.request("/api/library/unmapped", {
        headers: { Cookie: sessionCookie },
      });
      assert.deepStrictEqual(firstStateResponse["status"], 200);
      const firstState = await firstStateResponse.json();

      assert.deepStrictEqual(firstState.folders.length, 2);
      assert.deepStrictEqual(
        firstState.folders.filter(
          (folder: { match_status?: string }) => folder["match_status"] === "done",
        ).length,
        1,
      );
      assert.deepStrictEqual(
        firstState.folders.filter(
          (folder: { match_status?: string }) => folder["match_status"] === "pending",
        ).length,
        1,
      );
      assert.deepStrictEqual(firstState.has_outstanding_matches, true);
      assert.deepStrictEqual(firstState.is_scanning, false);

      const jobsResponse = await ctx.app.request("/api/system/jobs", {
        headers: { Cookie: sessionCookie },
      });
      assert.deepStrictEqual(jobsResponse["status"], 200);
      const jobs = await jobsResponse.json();
      const unmappedJob = jobs.find((job: { name: string }) => job.name === "unmapped_scan");

      assert(unmappedJob);
      assert.deepStrictEqual(unmappedJob.last_status, "success");
      assert.deepStrictEqual(unmappedJob.schedule_mode, "manual");

      const secondScanResponse = await ctx.app.request("/api/library/unmapped/scan", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });
      const acceptedSecondScan = await expectAcceptedTaskResponse(secondScanResponse);
      await waitForSystemTask({
        ctx,
        sessionCookie,
        taskId: acceptedSecondScan.task_id,
      });

      await waitForSql(
        client,
        "select count(*) as value from unmapped_folder_matches where match_status = 'done'",
        [],
        (rows) => Number(rows[0]?.["value"] ?? 0) === 2,
      );

      const secondStateResponse = await ctx.app.request("/api/library/unmapped", {
        headers: { Cookie: sessionCookie },
      });
      assert.deepStrictEqual(secondStateResponse["status"], 200);
      const secondState = await secondStateResponse.json();

      assert.deepStrictEqual(secondState.folders.length, 2);
      assert.deepStrictEqual(
        secondState.folders.every(
          (folder: { match_status?: string }) => folder["match_status"] === "done",
        ),
        true,
      );
      assert.deepStrictEqual(secondState.has_outstanding_matches, false);
      assert.deepStrictEqual(secondState.is_scanning, false);
    } finally {
      client.close();
    }
  });
});

itWithTestContext("unmapped folders mark already-imported anime suggestions", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (libraryPath) => {
    const currentConfigResponse = await ctx.app.request("/api/system/config", {
      headers: { Cookie: sessionCookie },
    });
    const currentConfig = await currentConfigResponse.json();

    await ctx.app.request("/api/system/config", {
      body: JSON.stringify({
        ...currentConfig,
        library: {
          ...currentConfig.library,
          library_path: libraryPath,
        },
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    const addResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: "",
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert.deepStrictEqual(addResponse["status"], 200);

    await mkdirPath(`${libraryPath}/Naruto Archive`, { recursive: true });

    const scanResponse = await ctx.app.request("/api/library/unmapped/scan", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    const acceptedScan = await expectAcceptedTaskResponse(scanResponse);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedScan.task_id,
    });

    const client = createClient({ url: `file:${ctx.databaseFile}` });

    try {
      await waitForSql(
        client,
        "select match_status from unmapped_folder_matches where path = ? limit 1",
        [`${libraryPath}/Naruto Archive`],
        (rows) => rows[0]?.["match_status"] === "done",
      );
    } finally {
      client.close();
    }

    const unmappedResponse = await ctx.app.request("/api/library/unmapped", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(unmappedResponse["status"], 200);
    const state = await unmappedResponse.json();
    const folder = state.folders.find((entry: { name: string }) => entry.name === "Naruto Archive");

    assert(folder);
    assert.deepStrictEqual(state.has_outstanding_matches, false);
    assert.deepStrictEqual(folder["match_status"], "done");
    assert(typeof folder.last_matched_at === "string");
    assert.deepStrictEqual(folder.suggested_matches.length > 0, true);
    assert.deepStrictEqual(folder.suggested_matches[0].id, 20);
    assert.deepStrictEqual(folder.suggested_matches[0].already_in_library, true);
  });
});

itWithTestContext("concurrent unmapped scan requests coalesce into one run", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (libraryPath) => {
    await mkdirPath(`${libraryPath}/Naruto Archive`, { recursive: true });

    const currentConfigResponse = await ctx.app.request("/api/system/config", {
      headers: { Cookie: sessionCookie },
    });
    const currentConfig = await currentConfigResponse.json();

    await ctx.app.request("/api/system/config", {
      body: JSON.stringify({
        ...currentConfig,
        library: {
          ...currentConfig.library,
          library_path: libraryPath,
        },
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    const [firstScanResponse, secondScanResponse] = await Promise.all([
      ctx.app.request("/api/library/unmapped/scan", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      }),
      ctx.app.request("/api/library/unmapped/scan", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      }),
    ]);

    const firstAccepted = await expectAcceptedTaskResponse(firstScanResponse);
    const secondAccepted = await expectAcceptedTaskResponse(secondScanResponse);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: firstAccepted.task_id,
    });
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: secondAccepted.task_id,
    });

    const client = createClient({ url: `file:${ctx.databaseFile}` });

    try {
      const runCountRows = await waitForSql(
        client,
        "select run_count as value from background_jobs where name = 'unmapped_scan' limit 1",
        [],
        (rows) => Number(rows[0]?.["value"] ?? 0) >= 1,
      );

      assert.deepStrictEqual(Number(runCountRows[0]?.["value"] ?? 0), 1);

      await waitForSql(
        client,
        "select count(*) as value from unmapped_folder_matches where match_status = 'done'",
        [],
        (rows) => Number(rows[0]?.["value"] ?? 0) === 1,
      );
    } finally {
      client.close();
    }
  });
});

itWithTestContext(
  "stale matching folders are retried on the next unmapped scan run",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (libraryPath) => {
      const folderPath = `${libraryPath}/Naruto Archive`;
      await mkdirPath(folderPath, { recursive: true });

      const currentConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      const currentConfig = await currentConfigResponse.json();

      await ctx.app.request("/api/system/config", {
        body: JSON.stringify({
          ...currentConfig,
          library: {
            ...currentConfig.library,
            library_path: libraryPath,
          },
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const client = createClient({ url: `file:${ctx.databaseFile}` });

      try {
        await client.execute(
          "insert into unmapped_folder_matches (path, name, size, match_status, suggested_matches, last_matched_at, last_match_error, updated_at) values (?, ?, 0, 'matching', '[]', null, null, ?)",
          [folderPath, "Naruto Archive", new Date().toISOString()],
        );

        const scanResponse = await ctx.app.request("/api/library/unmapped/scan", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });
        const acceptedScan = await expectAcceptedTaskResponse(scanResponse);
        await waitForSystemTask({
          ctx,
          sessionCookie,
          taskId: acceptedScan.task_id,
        });

        await waitForSql(
          client,
          "select match_status as value from unmapped_folder_matches where path = ? limit 1",
          [folderPath],
          (rows) => rows[0]?.["value"] === "done",
        );
      } finally {
        client.close();
      }

      const unmappedResponse = await ctx.app.request("/api/library/unmapped", {
        headers: { Cookie: sessionCookie },
      });

      assert.deepStrictEqual(unmappedResponse["status"], 200);
      const state = await unmappedResponse.json();
      const folder = state.folders.find(
        (entry: { name: string }) => entry.name === "Naruto Archive",
      );

      assert(folder);
      assert.deepStrictEqual(state.has_outstanding_matches, false);
      assert.deepStrictEqual(folder["match_status"], "done");
    });
  },
);

itWithTestContext(
  "failed unmapped folders below the retry limit are retried on the next scan run",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (libraryPath) => {
      const folderPath = `${libraryPath}/Naruto Archive`;
      await mkdirPath(folderPath, { recursive: true });

      const currentConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      const currentConfig = await currentConfigResponse.json();

      await ctx.app.request("/api/system/config", {
        body: JSON.stringify({
          ...currentConfig,
          library: {
            ...currentConfig.library,
            library_path: libraryPath,
          },
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const client = createClient({ url: `file:${ctx.databaseFile}` });

      try {
        await client.execute(
          "insert into unmapped_folder_matches (path, name, size, match_status, match_attempts, suggested_matches, last_matched_at, last_match_error, updated_at) values (?, ?, 0, 'failed', 1, '[]', ?, ?, ?)",
          [
            folderPath,
            "Naruto Archive",
            new Date().toISOString(),
            "rate limited",
            new Date().toISOString(),
          ],
        );

        const scanResponse = await ctx.app.request("/api/library/unmapped/scan", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });
        const acceptedScan = await expectAcceptedTaskResponse(scanResponse);
        await waitForSystemTask({
          ctx,
          sessionCookie,
          taskId: acceptedScan.task_id,
        });

        await waitForSql(
          client,
          "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
          [folderPath],
          (rows) => rows[0]?.["status"] === "done" && Number(rows[0]?.["attempts"] ?? 0) === 0,
        );
      } finally {
        client.close();
      }

      const unmappedResponse = await ctx.app.request("/api/library/unmapped", {
        headers: { Cookie: sessionCookie },
      });

      assert.deepStrictEqual(unmappedResponse["status"], 200);
      const state = await unmappedResponse.json();
      const folder = state.folders.find(
        (entry: { name: string }) => entry.name === "Naruto Archive",
      );

      assert(folder);
      assert.deepStrictEqual(state.has_outstanding_matches, false);
      assert.deepStrictEqual(folder["match_status"], "done");
      assert.deepStrictEqual(folder.match_attempts, 0);
    });
  },
);

itWithTestContext("failed unmapped folders stop retrying after three attempts", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (libraryPath) => {
    const folderPath = `${libraryPath}/Naruto Archive`;
    await mkdirPath(folderPath, { recursive: true });

    const currentConfigResponse = await ctx.app.request("/api/system/config", {
      headers: { Cookie: sessionCookie },
    });
    const currentConfig = await currentConfigResponse.json();

    await ctx.app.request("/api/system/config", {
      body: JSON.stringify({
        ...currentConfig,
        library: {
          ...currentConfig.library,
          library_path: libraryPath,
        },
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    const client = createClient({ url: `file:${ctx.databaseFile}` });

    try {
      await client.execute(
        "insert into unmapped_folder_matches (path, name, size, match_status, match_attempts, suggested_matches, last_matched_at, last_match_error, updated_at) values (?, ?, 0, 'failed', 3, '[]', ?, ?, ?)",
        [
          folderPath,
          "Naruto Archive",
          new Date().toISOString(),
          "AniList unavailable",
          new Date().toISOString(),
        ],
      );

      const scanResponse = await ctx.app.request("/api/library/unmapped/scan", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });
      const acceptedScan = await expectAcceptedTaskResponse(scanResponse);
      await waitForSystemTask({
        ctx,
        sessionCookie,
        taskId: acceptedScan.task_id,
      });

      const rows = await waitForSql(
        client,
        "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
        [folderPath],
        (values) => values.length === 1,
      );

      assert.deepStrictEqual(rows[0]?.["status"], "failed");
      assert.deepStrictEqual(Number(rows[0]?.["attempts"] ?? 0), 3);
    } finally {
      client.close();
    }

    const unmappedResponse = await ctx.app.request("/api/library/unmapped", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(unmappedResponse["status"], 200);
    const state = await unmappedResponse.json();
    const folder = state.folders.find((entry: { name: string }) => entry.name === "Naruto Archive");

    assert(folder);
    assert.deepStrictEqual(state.has_outstanding_matches, false);
    assert.deepStrictEqual(folder["match_status"], "failed");
    assert.deepStrictEqual(folder.match_attempts, 3);
  });
});

itWithTestContext(
  "unmapped folder controls pause resume reset and refresh matching",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (libraryPath) => {
      const folderPath = `${libraryPath}/Naruto Archive`;
      await mkdirPath(folderPath, { recursive: true });

      const currentConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      const currentConfig = await currentConfigResponse.json();

      await ctx.app.request("/api/system/config", {
        body: JSON.stringify({
          ...currentConfig,
          library: {
            ...currentConfig.library,
            library_path: libraryPath,
          },
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const client = createClient({ url: `file:${ctx.databaseFile}` });

      try {
        await client.execute(
          'insert into unmapped_folder_matches (path, name, size, match_status, match_attempts, suggested_matches, last_matched_at, last_match_error, updated_at) values (?, ?, 0, \'failed\', 2, \'[{"id":20,"title":{"romaji":"Naruto"},"already_in_library":true}]\', ?, ?, ?)',
          [
            folderPath,
            "Naruto Archive",
            new Date().toISOString(),
            "rate limited",
            new Date().toISOString(),
          ],
        );

        const pauseResponse = await ctx.app.request("/api/library/unmapped/control", {
          body: JSON.stringify({ action: "pause", path: folderPath }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(pauseResponse["status"], 200);

        let rows = await waitForSql(
          client,
          "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
          [folderPath],
          (values) => values[0]?.["status"] === "paused",
        );
        assert.deepStrictEqual(Number(rows[0]?.["attempts"] ?? 0), 2);

        const resumeResponse = await ctx.app.request("/api/library/unmapped/control", {
          body: JSON.stringify({ action: "resume", path: folderPath }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(resumeResponse["status"], 200);

        rows = await waitForSql(
          client,
          "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
          [folderPath],
          (values) => values[0]?.["status"] === "pending",
        );
        assert.deepStrictEqual(Number(rows[0]?.["attempts"] ?? 0), 2);

        const resetResponse = await ctx.app.request("/api/library/unmapped/control", {
          body: JSON.stringify({ action: "reset", path: folderPath }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(resetResponse["status"], 200);

        rows = await waitForSql(
          client,
          "select match_status as status, match_attempts as attempts, last_match_error as error, suggested_matches as suggestions from unmapped_folder_matches where path = ? limit 1",
          [folderPath],
          (values) =>
            values[0]?.["status"] === "pending" && Number(values[0]?.["attempts"] ?? 0) === 0,
        );
        assert.deepStrictEqual(rows[0]?.["error"], null);
        assert.deepStrictEqual(rows[0]?.["suggestions"], "[]");

        const refreshResponse = await ctx.app.request("/api/library/unmapped/control", {
          body: JSON.stringify({ action: "refresh", path: folderPath }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(refreshResponse["status"], 200);

        rows = await waitForSql(
          client,
          "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
          [folderPath],
          (values) => values[0]?.["status"] === "done",
        );
        assert.deepStrictEqual(Number(rows[0]?.["attempts"] ?? 0), 0);
      } finally {
        client.close();
      }
    });
  },
);

itWithTestContext(
  "bulk unmapped folder controls resume paused and retry failed folders",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (libraryPath) => {
      const pausedFolderPath = `${libraryPath}/Paused Archive`;
      const failedFolderPath = `${libraryPath}/Naruto Archive`;
      await mkdirPath(pausedFolderPath, { recursive: true });
      await mkdirPath(failedFolderPath, { recursive: true });

      const currentConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      const currentConfig = await currentConfigResponse.json();

      await ctx.app.request("/api/system/config", {
        body: JSON.stringify({
          ...currentConfig,
          library: {
            ...currentConfig.library,
            library_path: libraryPath,
          },
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const client = createClient({ url: `file:${ctx.databaseFile}` });

      try {
        await client.execute(
          "insert into unmapped_folder_matches (path, name, size, match_status, match_attempts, suggested_matches, last_matched_at, last_match_error, updated_at) values (?, ?, 0, 'paused', 1, '[]', ?, null, ?)",
          [pausedFolderPath, "Paused Archive", new Date().toISOString(), new Date().toISOString()],
        );

        await client.execute(
          'insert into unmapped_folder_matches (path, name, size, match_status, match_attempts, suggested_matches, last_matched_at, last_match_error, updated_at) values (?, ?, 0, \'failed\', 3, \'[{"id":20,"title":{"romaji":"Naruto"},"already_in_library":true}]\', ?, ?, ?)',
          [
            failedFolderPath,
            "Naruto Archive",
            new Date().toISOString(),
            "AniList unavailable",
            new Date().toISOString(),
          ],
        );

        const retryFailedResponse = await ctx.app.request("/api/library/unmapped/control/bulk", {
          body: JSON.stringify({ action: "retry_failed" }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(retryFailedResponse["status"], 200);

        let rows = await waitForSql(
          client,
          "select match_status as status, match_attempts as attempts, suggested_matches as suggestions from unmapped_folder_matches where path = ? limit 1",
          [failedFolderPath],
          (values) =>
            values[0]?.["status"] === "pending" && Number(values[0]?.["attempts"] ?? 0) === 0,
        );
        assert.deepStrictEqual(rows[0]?.["suggestions"], "[]");

        const scanResponse = await ctx.app.request("/api/library/unmapped/scan", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });
        const acceptedScan = await expectAcceptedTaskResponse(scanResponse);
        await waitForSystemTask({
          ctx,
          sessionCookie,
          taskId: acceptedScan.task_id,
        });

        rows = await waitForSql(
          client,
          "select match_status as status from unmapped_folder_matches where path = ? limit 1",
          [pausedFolderPath],
          (values) => values[0]?.["status"] === "paused",
        );
        assert.deepStrictEqual(rows[0]?.["status"], "paused");

        const startPausedResponse = await ctx.app.request("/api/library/unmapped/control/bulk", {
          body: JSON.stringify({ action: "resume_paused" }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(startPausedResponse["status"], 200);

        rows = await waitForSql(
          client,
          "select match_status as status from unmapped_folder_matches where path = ? limit 1",
          [pausedFolderPath],
          (values) => values[0]?.["status"] === "pending",
        );
        assert.deepStrictEqual(rows[0]?.["status"], "pending");
      } finally {
        client.close();
      }
    });
  },
);

itWithTestContext(
  "bulk unmapped folder controls can pause queued and reset failed folders",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (libraryPath) => {
      const queuedFolderPath = `${libraryPath}/Queued Archive`;
      const failedFolderPath = `${libraryPath}/Failed Archive`;
      await mkdirPath(queuedFolderPath, { recursive: true });
      await mkdirPath(failedFolderPath, { recursive: true });

      const currentConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      const currentConfig = await currentConfigResponse.json();

      await ctx.app.request("/api/system/config", {
        body: JSON.stringify({
          ...currentConfig,
          library: {
            ...currentConfig.library,
            library_path: libraryPath,
          },
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const client = createClient({ url: `file:${ctx.databaseFile}` });

      try {
        await client.execute(
          "insert into unmapped_folder_matches (path, name, size, match_status, match_attempts, suggested_matches, last_matched_at, last_match_error, updated_at) values (?, ?, 0, 'pending', 1, '[]', ?, null, ?)",
          [queuedFolderPath, "Queued Archive", new Date().toISOString(), new Date().toISOString()],
        );

        await client.execute(
          'insert into unmapped_folder_matches (path, name, size, match_status, match_attempts, suggested_matches, last_matched_at, last_match_error, updated_at) values (?, ?, 0, \'failed\', 3, \'[{"id":20,"title":{"romaji":"Naruto"},"already_in_library":true}]\', ?, ?, ?)',
          [
            failedFolderPath,
            "Failed Archive",
            new Date().toISOString(),
            "AniList unavailable",
            new Date().toISOString(),
          ],
        );

        const pauseQueuedResponse = await ctx.app.request("/api/library/unmapped/control/bulk", {
          body: JSON.stringify({ action: "pause_queued" }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(pauseQueuedResponse["status"], 200);

        let rows = await waitForSql(
          client,
          "select match_status as status from unmapped_folder_matches where path = ? limit 1",
          [queuedFolderPath],
          (values) => values[0]?.["status"] === "paused",
        );
        assert.deepStrictEqual(rows[0]?.["status"], "paused");

        const resetFailedResponse = await ctx.app.request("/api/library/unmapped/control/bulk", {
          body: JSON.stringify({ action: "reset_failed" }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(resetFailedResponse["status"], 200);

        rows = await waitForSql(
          client,
          "select match_status as status, match_attempts as attempts, suggested_matches as suggestions, last_match_error as error from unmapped_folder_matches where path = ? limit 1",
          [failedFolderPath],
          (values) =>
            values[0]?.["status"] === "pending" && Number(values[0]?.["attempts"] ?? 0) === 0,
        );
        assert.deepStrictEqual(rows[0]?.["suggestions"], "[]");
        assert.deepStrictEqual(rows[0]?.["error"], null);
      } finally {
        client.close();
      }
    });
  },
);

itWithTestContext(
  "download reconcile imports a completed file into the anime library",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (animeRoot) => {
      await withTempDir(async (completedRoot) => {
        const addAnimeResponse = await ctx.app.request("/api/anime", {
          body: JSON.stringify({
            id: 20,
            monitor_and_search: false,
            monitored: true,
            profile_name: "Default",
            release_profile_ids: [],
            root_folder: animeRoot,
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(addAnimeResponse["status"], 200);

        const magnetHash = "1234567890abcdef1234567890abcdef12345678";
        const triggerDownloadResponse = await ctx.app.request("/api/search/download", {
          body: JSON.stringify({
            anime_id: 20,
            episode_number: 1,
            magnet: `magnet:?xt=urn:btih:${magnetHash}`,
            title: "Naruto - 01",
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(triggerDownloadResponse["status"], 200);

        const completedFile = `${completedRoot}/Naruto - 01.mkv`;
        await writeTextFile(completedFile, "completed-download");

        const client = createClient({ url: `file:${ctx.databaseFile}` });
        try {
          await client.execute({
            sql: "update downloads set content_path = ?, save_path = ?, status = ?, external_state = ? where info_hash = ?",
            args: [completedFile, completedFile, "completed", "completed", magnetHash],
          });
        } finally {
          client.close();
        }

        const reconcileResponse = await ctx.app.request("/api/downloads/1/reconcile", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });
        assert.deepStrictEqual(reconcileResponse["status"], 200);

        const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
          headers: { Cookie: sessionCookie },
        });
        assert.deepStrictEqual(episodesResponse["status"], 200);
        const episodes = await episodesResponse.json();
        assert.deepStrictEqual(episodes[0].downloaded, true);
        assert.deepStrictEqual(episodes[0].file_path?.startsWith(`${animeRoot}/Naruto/`), true);

        const historyResponse = await ctx.app.request("/api/downloads/history", {
          headers: { Cookie: sessionCookie },
        });
        assert.deepStrictEqual(historyResponse["status"], 200);
        const history = await historyResponse.json();
        assert.deepStrictEqual(history[0]["status"], "imported");
      });
    });
  },
);

it.scoped("download sync auto-imports paused seeding torrents", () =>
  withTempDirEffect((animeRoot) =>
    withTempDirEffect((completedRoot) =>
      Effect.tryPromise(async () => {
        const magnetHash = "1234567890abcdef1234567890abcdef12345678";
        const completedFile = `${completedRoot}/Naruto - 01.mkv`;
        await writeTextFile(completedFile, "completed-download");

        const qbitLayer = Layer.succeed(QBitTorrentClient, {
          addTorrentUrl: () => Effect.void,
          deleteTorrent: () => Effect.void,
          listTorrentContents: () =>
            Effect.succeed([
              {
                index: 0,
                is_seed: true,
                name: "Naruto - 01.mkv",
                priority: 1,
                progress: 1,
                size: 524_288_000,
              },
            ]),
          listTorrents: () =>
            Effect.succeed([
              {
                content_path: completedFile,
                downloaded: 524_288_000,
                dlspeed: 0,
                eta: 0,
                hash: magnetHash,
                name: "Naruto - 01",
                progress: 1,
                save_path: completedRoot,
                size: 524_288_000,
                state: "pausedUP",
              },
            ] satisfies QBitTorrent[]),
          pauseTorrent: () => Effect.void,
          resumeTorrent: () => Effect.void,
        });

        await Effect.runPromise(
          withTestContextEffect({
            options: { qbitLayer },
            run: (ctx) =>
              Effect.tryPromise(async () => {
                const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

                const currentConfigResponse = await ctx.app.request("/api/system/config", {
                  headers: { Cookie: sessionCookie },
                });
                const currentConfig = await currentConfigResponse.json();

                const updatedConfigResponse = await ctx.app.request("/api/system/config", {
                  body: JSON.stringify({
                    ...currentConfig,
                    qbittorrent: {
                      ...currentConfig.qbittorrent,
                      enabled: true,
                      password: "secret",
                    },
                  }),
                  headers: {
                    Cookie: sessionCookie,
                    "Content-Type": "application/json",
                  },
                  method: "PUT",
                });
                assert.deepStrictEqual(updatedConfigResponse["status"], 200);

                const addAnimeResponse = await ctx.app.request("/api/anime", {
                  body: JSON.stringify({
                    id: 20,
                    monitor_and_search: false,
                    monitored: true,
                    profile_name: "Default",
                    release_profile_ids: [],
                    root_folder: animeRoot,
                  }),
                  headers: {
                    Cookie: sessionCookie,
                    "Content-Type": "application/json",
                  },
                  method: "POST",
                });
                assert.deepStrictEqual(addAnimeResponse["status"], 200);

                const triggerDownloadResponse = await ctx.app.request("/api/search/download", {
                  body: JSON.stringify({
                    anime_id: 20,
                    episode_number: 1,
                    magnet: `magnet:?xt=urn:btih:${magnetHash}`,
                    title: "Naruto - 01",
                  }),
                  headers: {
                    Cookie: sessionCookie,
                    "Content-Type": "application/json",
                  },
                  method: "POST",
                });
                assert.deepStrictEqual(triggerDownloadResponse["status"], 200);

                const syncResponse = await ctx.app.request("/api/downloads/sync", {
                  headers: { Cookie: sessionCookie },
                  method: "POST",
                });
                const acceptedSync = await expectAcceptedTaskResponse(syncResponse);
                await waitForSystemTask({
                  ctx,
                  sessionCookie,
                  taskId: acceptedSync.task_id,
                });

                const verifyClient = createClient({ url: `file:${ctx.databaseFile}` });
                try {
                  await waitForSql(
                    verifyClient,
                    "select status, reconciled_at as reconciledAt from downloads where info_hash = ?",
                    [magnetHash],
                    (rows) =>
                      rows[0]?.["status"] === "imported" &&
                      typeof rows[0]?.["reconciledAt"] === "string",
                  );
                } finally {
                  verifyClient.close();
                }

                const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
                  headers: { Cookie: sessionCookie },
                });
                assert.deepStrictEqual(episodesResponse["status"], 200);
                const episodes = await episodesResponse.json();
                assert.deepStrictEqual(episodes[0].downloaded, true);
                assert.deepStrictEqual(
                  episodes[0].file_path?.startsWith(`${animeRoot}/Naruto/`),
                  true,
                );
              }),
          }),
        );
      }),
    ),
  ),
);

itWithTestContext(
  "manual search download treats season-only batch torrents as batches",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (rootFolder) => {
      const addAnimeResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 140960,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: rootFolder,
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(addAnimeResponse["status"], 200);

      const triggerDownloadResponse = await ctx.app.request("/api/search/download", {
        body: JSON.stringify({
          anime_id: 140960,
          magnet: "magnet:?xt=urn:btih:test-batch-season-pack",
          title: "[Flugel] Chainsaw Man S01 (BD 1080p HEVC Opus) [Multi Audio]",
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(triggerDownloadResponse["status"], 200);

      const historyResponse = await ctx.app.request("/api/downloads/history", {
        headers: { Cookie: sessionCookie },
      });
      assert.deepStrictEqual(historyResponse["status"], 200);
      const history = await historyResponse.json();

      assert.deepStrictEqual(history.length, 1);
      assert.deepStrictEqual(history[0].is_batch, true);
      assert.deepStrictEqual(history[0].coverage_pending, true);
      assert.deepStrictEqual(history[0].covered_episodes, undefined);
      assert.deepStrictEqual(history[0].episode_number, 1);
    });
  },
);

it.scoped("download sync refines season-pack coverage from qBittorrent file list", () => {
  const magnetHash = "feedfeedfeedfeedfeedfeedfeedfeedfeedfeed";
  const qbitLayer = Layer.succeed(QBitTorrentClient, {
    addTorrentUrl: () => Effect.void,
    deleteTorrent: () => Effect.void,
    listTorrentContents: () =>
      Effect.succeed([
        {
          index: 0,
          is_seed: false,
          name: "Season 01/Chainsaw Man - 01.mkv",
          priority: 1,
          progress: 0.2,
          size: 100,
        },
        {
          index: 1,
          is_seed: false,
          name: "Season 01/Chainsaw Man - 02.mkv",
          priority: 1,
          progress: 0.2,
          size: 100,
        },
        {
          index: 2,
          is_seed: false,
          name: "Season 01/NCOP.mkv",
          priority: 1,
          progress: 0.2,
          size: 100,
        },
      ]),
    listTorrents: () =>
      Effect.succeed([
        {
          content_path: undefined,
          downloaded: 0,
          dlspeed: 1,
          eta: 99,
          hash: magnetHash,
          name: "Chainsaw Man S01",
          progress: 0.2,
          save_path: "/downloads/chainsaw-man-s01",
          size: 300,
          state: "downloading",
        },
      ]),
    pauseTorrent: () => Effect.void,
    resumeTorrent: () => Effect.void,
  });

  return withTestContextEffect({
    options: { qbitLayer },
    run: (ctx) =>
      Effect.tryPromise(async () => {
        const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

        const currentConfigResponse = await ctx.app.request("/api/system/config", {
          headers: { Cookie: sessionCookie },
        });
        const currentConfig = await currentConfigResponse.json();

        const updatedConfigResponse = await ctx.app.request("/api/system/config", {
          body: JSON.stringify({
            ...currentConfig,
            qbittorrent: {
              ...currentConfig.qbittorrent,
              enabled: true,
              password: "secret",
            },
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "PUT",
        });
        assert.deepStrictEqual(updatedConfigResponse["status"], 200);

        await withTempDir(async (rootFolder) => {
          const addAnimeResponse = await ctx.app.request("/api/anime", {
            body: JSON.stringify({
              id: 140960,
              monitor_and_search: false,
              monitored: true,
              profile_name: "Default",
              release_profile_ids: [],
              root_folder: rootFolder,
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          });
          assert.deepStrictEqual(addAnimeResponse["status"], 200);

          const triggerDownloadResponse = await ctx.app.request("/api/search/download", {
            body: JSON.stringify({
              anime_id: 140960,
              magnet: `magnet:?xt=urn:btih:${magnetHash}`,
              title: "[Flugel] Chainsaw Man S01 (BD 1080p HEVC Opus) [Multi Audio]",
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          });
          assert.deepStrictEqual(triggerDownloadResponse["status"], 200);

          const syncResponse = await ctx.app.request("/api/downloads/sync", {
            headers: { Cookie: sessionCookie },
            method: "POST",
          });
          const acceptedSync = await expectAcceptedTaskResponse(syncResponse);
          await waitForSystemTask({
            ctx,
            sessionCookie,
            taskId: acceptedSync.task_id,
          });

          const historyResponse = await ctx.app.request("/api/downloads/history", {
            headers: { Cookie: sessionCookie },
          });
          assert.deepStrictEqual(historyResponse["status"], 200);
          const history = await historyResponse.json();

          assert.deepStrictEqual(history.length, 1);
          assert.deepStrictEqual(history[0].covered_episodes, [1, 2]);
          assert.deepStrictEqual(history[0].episode_number, 1);
          assert.deepStrictEqual(history[0].is_batch, true);
          assert.deepStrictEqual(history[0].coverage_pending, undefined);
        });
      }),
  });
});

it("qBittorrent state mapping treats completed seeding states as completed", () => {
  assert.deepStrictEqual(mapQBitState("pausedUP"), "completed");
  assert.deepStrictEqual(mapQBitState("queuedUP"), "completed");
  assert.deepStrictEqual(mapQBitState("stalledUP"), "completed");
  assert.deepStrictEqual(mapQBitState("checkingUP"), "completed");
  assert.deepStrictEqual(mapQBitState("forcedUP"), "completed");
  assert.deepStrictEqual(mapQBitState("pausedDL"), "paused");
});

itWithTestContext("download operation error branches return expected statuses", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  const missingPause = await ctx.app.request("/api/downloads/999/pause", {
    headers: { Cookie: sessionCookie },
    method: "POST",
  });
  assert.deepStrictEqual(missingPause["status"], 404);
  assert.deepStrictEqual(await missingPause.text(), "Download not found");

  await withTempDir(async (rootFolder) => {
    const addAnimeResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(addAnimeResponse["status"], 200);

    const triggerDownloadResponse = await ctx.app.request("/api/search/download", {
      body: JSON.stringify({
        anime_id: 20,
        episode_number: 1,
        magnet: "magnet:?xt=urn:btih:test-download-ops",
        title: "Naruto - 01",
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(triggerDownloadResponse["status"], 200);

    const client = createClient({ url: `file:${ctx.databaseFile}` });
    try {
      await client.execute({
        sql: "update downloads set magnet = null where id = 1",
        args: [],
      });
    } finally {
      client.close();
    }

    const retryConflict = await ctx.app.request("/api/downloads/1/retry", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    assert.deepStrictEqual(retryConflict["status"], 409);
    assert.deepStrictEqual(
      await retryConflict.text(),
      "Download cannot be retried without a magnet link",
    );

    const reconcileConflict = await ctx.app.request("/api/downloads/1/reconcile", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    assert.deepStrictEqual(reconcileConflict["status"], 409);
    assert.deepStrictEqual(
      await reconcileConflict.text(),
      "Download has no reconciliable content path",
    );
  });
});

itWithTestContext("download pause resume and delete endpoints update queue state", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    const addAnimeResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(addAnimeResponse["status"], 200);

    const triggerDownloadResponse = await ctx.app.request("/api/search/download", {
      body: JSON.stringify({
        anime_id: 20,
        episode_number: 1,
        magnet: "magnet:?xt=urn:btih:test-download-state",
        title: "Naruto - 01",
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(triggerDownloadResponse["status"], 200);

    const pauseResponse = await ctx.app.request("/api/downloads/1/pause", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    assert.deepStrictEqual(pauseResponse["status"], 200);

    const queueAfterPause = await ctx.app.request("/api/downloads/queue", {
      headers: { Cookie: sessionCookie },
    });
    const pausedDownloads = await queueAfterPause.json();
    assert.deepStrictEqual(pausedDownloads[0]["status"], "paused");

    const resumeResponse = await ctx.app.request("/api/downloads/1/resume", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });
    assert.deepStrictEqual(resumeResponse["status"], 200);

    const queueAfterResume = await ctx.app.request("/api/downloads/queue", {
      headers: { Cookie: sessionCookie },
    });
    const resumedDownloads = await queueAfterResume.json();
    assert.deepStrictEqual(resumedDownloads[0]["status"], "downloading");

    const deleteResponse = await ctx.app.request("/api/downloads/1?delete_files=true", {
      headers: { Cookie: sessionCookie },
      method: "DELETE",
    });
    assert.deepStrictEqual(deleteResponse["status"], 200);

    const queueAfterDelete = await ctx.app.request("/api/downloads/queue", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual((await queueAfterDelete.json()).length, 0);

    const historyAfterDelete = await ctx.app.request("/api/downloads/history", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual((await historyAfterDelete.json()).length, 0);
  });
});

itWithTestContext("anime update, map, stream, and delete endpoints work", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  const regenerateApiKey = await ctx.app.request("/api/auth/api-key/regenerate", {
    headers: { Cookie: sessionCookie },
    method: "POST",
  });
  assert.deepStrictEqual(regenerateApiKey["status"], 200);
  const { api_key: apiKey } = await regenerateApiKey.json();

  const apiKeyLoginResponse = await ctx.app.request("/api/auth/login/api-key", {
    body: JSON.stringify({ api_key: apiKey }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert.deepStrictEqual(apiKeyLoginResponse["status"], 200);
  const apiKeySessionCookie = apiKeyLoginResponse.headers.get("set-cookie");
  assert(apiKeySessionCookie);

  await withTempDir(async (rootFolder) => {
    await withTempDir(async (updatedFolder) => {
      const releaseProfileResponse = await ctx.app.request("/api/release-profiles", {
        body: JSON.stringify({
          enabled: true,
          is_global: false,
          name: "Anime Endpoint Release",
          rules: [{ rule_type: "preferred", score: 5, term: "SubsPlease" }],
        }),
        headers: {
          Cookie: apiKeySessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(releaseProfileResponse["status"], 200);
      const releaseProfile = await releaseProfileResponse.json();

      const addResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 20,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: rootFolder,
        }),
        headers: {
          Cookie: apiKeySessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(addResponse["status"], 200);

      const monitorResponse = await ctx.app.request("/api/anime/20/monitor", {
        body: JSON.stringify({ monitored: false }),
        headers: {
          Cookie: apiKeySessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(monitorResponse["status"], 200);

      const pathResponse = await ctx.app.request("/api/anime/20/path", {
        body: JSON.stringify({ path: updatedFolder }),
        headers: {
          Cookie: apiKeySessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });
      assert.deepStrictEqual(pathResponse["status"], 200);

      const profileResponse = await ctx.app.request("/api/anime/20/profile", {
        body: JSON.stringify({ profile_name: "Default" }),
        headers: {
          Cookie: apiKeySessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });
      assert.deepStrictEqual(profileResponse["status"], 200);

      const releaseProfilesResponse = await ctx.app.request("/api/anime/20/release-profiles", {
        body: JSON.stringify({ release_profile_ids: [releaseProfile.id] }),
        headers: {
          Cookie: apiKeySessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });
      assert.deepStrictEqual(releaseProfilesResponse["status"], 200);

      const filePath = `${updatedFolder}/Naruto - 001.mkv`;
      await writeTextFile(filePath, "streamable");

      const mapResponse = await ctx.app.request("/api/anime/20/episodes/1/map", {
        body: JSON.stringify({ file_path: filePath }),
        headers: {
          Cookie: apiKeySessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(mapResponse["status"], 200);

      const detailResponse = await ctx.app.request("/api/anime/20", {
        headers: { Cookie: apiKeySessionCookie },
      });
      const detail = await detailResponse.json();
      assert.deepStrictEqual(detail.monitored, false);
      assert.deepStrictEqual(detail.root_folder, updatedFolder);
      assert.deepStrictEqual(detail.release_profile_ids, [releaseProfile.id]);

      const streamUnauthorized = await ctx.app.request("/api/stream/20/1");
      assert.deepStrictEqual(streamUnauthorized["status"], 403);

      const streamUrlResponse = await ctx.app.request("/api/anime/20/stream-url?episodeNumber=1", {
        headers: { Cookie: apiKeySessionCookie },
      });
      assert.deepStrictEqual(streamUrlResponse["status"], 200);
      const { url: signedStreamUrl } = await streamUrlResponse.json();

      const streamAuthorized = await ctx.app.request(signedStreamUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      assert.deepStrictEqual(streamAuthorized["status"], 200);
      assert.deepStrictEqual(streamAuthorized.headers.get("content-type"), "video/x-matroska");
      assert.deepStrictEqual(await streamAuthorized.text(), "streamable");

      const deleteEpisodeFileResponse = await ctx.app.request("/api/anime/20/episodes/1/file", {
        headers: { Cookie: apiKeySessionCookie },
        method: "DELETE",
      });
      assert.deepStrictEqual(deleteEpisodeFileResponse["status"], 200);

      const episodesAfterDelete = await ctx.app.request("/api/anime/20/episodes", {
        headers: { Cookie: apiKeySessionCookie },
      });
      const episodeRows = await episodesAfterDelete.json();
      assert.deepStrictEqual(episodeRows[0].downloaded, false);
      assert.deepStrictEqual(episodeRows[0].file_path, undefined);

      const deleteAnimeResponse = await ctx.app.request("/api/anime/20", {
        headers: { Cookie: apiKeySessionCookie },
        method: "DELETE",
      });
      assert.deepStrictEqual(deleteAnimeResponse["status"], 200);

      const animeListAfterDelete = await ctx.app.request("/api/anime", {
        headers: { Cookie: apiKeySessionCookie },
      });
      assert.deepStrictEqual((await animeListAfterDelete.json()).total, 0);
    });
  });
});

itWithTestContext(
  "stream endpoint rejects stale episode paths after anime root changes",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (initialRoot) => {
      await withTempDir(async (updatedRoot) => {
        const addResponse = await ctx.app.request("/api/anime", {
          body: JSON.stringify({
            id: 20,
            monitor_and_search: false,
            monitored: true,
            profile_name: "Default",
            release_profile_ids: [],
            root_folder: initialRoot,
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(addResponse["status"], 200);
        const anime = await addResponse.json();

        const filePath = `${anime.root_folder}/Naruto - 001.mkv`;
        await writeTextFile(filePath, "stale-stream");

        const mapResponse = await ctx.app.request("/api/anime/20/episodes/1/map", {
          body: JSON.stringify({ file_path: filePath }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(mapResponse["status"], 200);

        const streamUrlResponse = await ctx.app.request(
          "/api/anime/20/stream-url?episodeNumber=1",
          { headers: { Cookie: sessionCookie } },
        );
        assert.deepStrictEqual(streamUrlResponse["status"], 200);
        const { url: signedStreamUrl } = await streamUrlResponse.json();

        const initialStreamResponse = await ctx.app.request(signedStreamUrl);
        assert.deepStrictEqual(initialStreamResponse["status"], 200);
        assert.deepStrictEqual(await initialStreamResponse.text(), "stale-stream");

        const pathResponse = await ctx.app.request("/api/anime/20/path", {
          body: JSON.stringify({ path: updatedRoot }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "PUT",
        });
        assert.deepStrictEqual(pathResponse["status"], 200);

        const staleStreamResponse = await ctx.app.request(signedStreamUrl);
        assert.deepStrictEqual(staleStreamResponse["status"], 404);
      });
    });
  },
);

itWithTestContext("deleting an episode file removes the mapped file from disk", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    const addResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(addResponse["status"], 200);

    const anime = await addResponse.json();
    const filePath = `${anime.root_folder}/Naruto - 001.mkv`;
    await writeTextFile(filePath, "episode-bytes");

    const mapResponse = await ctx.app.request("/api/anime/20/episodes/1/map", {
      body: JSON.stringify({ file_path: filePath }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(mapResponse["status"], 200);

    const deleteResponse = await ctx.app.request("/api/anime/20/episodes/1/file", {
      headers: { Cookie: sessionCookie },
      method: "DELETE",
    });
    assert.deepStrictEqual(deleteResponse["status"], 200);

    let removed = false;
    try {
      await statPath(filePath);
    } catch {
      removed = true;
    }
    assert.deepStrictEqual(removed, true);
  });
});

itWithTestContext(
  "anime search and AniList detail endpoints return fallback metadata",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    const searchResponse = await ctx.app.request("/api/anime/search?q=naruto", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual(searchResponse["status"], 200);
    const searchResults = await searchResponse.json();
    assert.deepStrictEqual(searchResults.degraded, false);
    assert.deepStrictEqual(searchResults.results.length > 0, true);
    assert.deepStrictEqual(
      searchResults.results.some((item: { id: number }) => item.id === 20),
      true,
    );

    const detailResponse = await ctx.app.request("/api/anime/anilist/20", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual(detailResponse["status"], 200);
    const detail = await detailResponse.json();
    assert.deepStrictEqual(detail.id, 20);
    assert.deepStrictEqual(detail.title.romaji, "Naruto");
  },
);

itWithTestContext("RSS feed toggle and delete endpoints update feed state", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    const addAnimeResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(addAnimeResponse["status"], 200);

    const addFeedResponse = await ctx.app.request("/api/rss", {
      body: JSON.stringify({
        anime_id: 20,
        name: "Toggle Me",
        url: "https://example.com/toggle.xml",
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    assert.deepStrictEqual(addFeedResponse["status"], 200);
    const feed = await addFeedResponse.json();
    assert.deepStrictEqual(feed.enabled, true);

    const toggleResponse = await ctx.app.request(`/api/rss/${feed.id}/toggle`, {
      body: JSON.stringify({ enabled: false }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "PUT",
    });
    assert.deepStrictEqual(toggleResponse["status"], 200);

    const animeFeedsAfterToggle = await ctx.app.request("/api/anime/20/rss", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual(animeFeedsAfterToggle["status"], 200);
    const toggledFeeds = await animeFeedsAfterToggle.json();
    const toggledFeed = toggledFeeds.find((item: { id: number }) => item.id === feed.id);
    assert(toggledFeed);
    assert.deepStrictEqual(toggledFeed.enabled, false);

    const deleteResponse = await ctx.app.request(`/api/rss/${feed.id}`, {
      headers: { Cookie: sessionCookie },
      method: "DELETE",
    });
    assert.deepStrictEqual(deleteResponse["status"], 200);

    const animeFeedsAfterDelete = await ctx.app.request("/api/anime/20/rss", {
      headers: { Cookie: sessionCookie },
    });
    assert.deepStrictEqual(
      (await animeFeedsAfterDelete.json()).some((item: { id: number }) => item.id === feed.id),
      false,
    );
  });
});

itWithTestContext("validation errors return 400 for malformed or invalid requests", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  const malformedJsonResponse = await ctx.app.request("/api/profiles", {
    body: "{bad-json",
    headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
    method: "POST",
  });
  assert.deepStrictEqual(malformedJsonResponse["status"], 400);
  assert.deepStrictEqual(
    await malformedJsonResponse.text(),
    "Invalid JSON for create quality profile",
  );

  const invalidBodyResponse = await ctx.app.request("/api/profiles", {
    body: JSON.stringify({ name: "Incomplete" }),
    headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
    method: "POST",
  });
  assert.deepStrictEqual(invalidBodyResponse["status"], 400);
  assert.match(
    await invalidBodyResponse.text(),
    /^Invalid request body for create quality profile: .*: is missing(?:; .*: is missing)*$/,
  );

  const invalidQueryResponse = await ctx.app.request("/api/system/logs?page=0", {
    headers: { Cookie: sessionCookie },
  });
  assert.deepStrictEqual(invalidQueryResponse["status"], 400);
  assert.match(
    await invalidQueryResponse.text(),
    /^Invalid query parameters for system logs: page: Expected a positive number, actual 0; page: Expected undefined, actual "0"$/,
  );
});

itWithTestContext("anime CRUD and episode scan flow works", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    const addResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert.deepStrictEqual(addResponse["status"], 200);

    const anime = await addResponse.json();
    assert.deepStrictEqual(anime.id, 20);
    assert.deepStrictEqual(anime.title.romaji, "Naruto");
    assert.deepStrictEqual(anime.profile_name, "Default");
    assert.deepStrictEqual(anime.root_folder, `${rootFolder}/Naruto`);

    const listResponse = await ctx.app.request("/api/anime", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(listResponse["status"], 200);
    const list = await listResponse.json();
    assert.deepStrictEqual(list.total, 1);

    const paginatedListResponse = await ctx.app.request(
      "/api/anime?limit=1&offset=0&monitored=true",
      {
        headers: { Cookie: sessionCookie },
      },
    );
    assert.deepStrictEqual(paginatedListResponse["status"], 200);
    const paginatedList = await paginatedListResponse.json();
    assert.deepStrictEqual(paginatedList.limit, 1);
    assert.deepStrictEqual(paginatedList.offset, 0);
    assert.deepStrictEqual(paginatedList.total, 1);
    assert.deepStrictEqual(paginatedList.items.length, 1);

    const detailResponse = await ctx.app.request("/api/anime/20", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(detailResponse["status"], 200);
    const detail = await detailResponse.json();
    assert.deepStrictEqual(detail.episode_count, 220);

    const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(episodesResponse["status"], 200);
    const episodes = await episodesResponse.json();
    assert.deepStrictEqual(episodes.length, 220);
    assert.deepStrictEqual(episodes[0].number, 1);
    assert.deepStrictEqual(episodes[0].downloaded, false);

    await writeTextFile(`${anime.root_folder}/Naruto - 001.mkv`, "fake video data");

    const scanResponse = await ctx.app.request("/api/anime/20/episodes/scan", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    const acceptedScan = await expectAcceptedTaskResponse(scanResponse);
    const completedScanTask = await waitForAnimeScanTask({
      animeId: 20,
      ctx,
      sessionCookie,
      taskId: acceptedScan.task_id,
    });
    assert.deepStrictEqual(completedScanTask.payload?.found, 1);
    assert.deepStrictEqual(completedScanTask.payload?.total, 1);

    const filesResponse = await ctx.app.request("/api/anime/20/files", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(filesResponse["status"], 200);
    const files = await filesResponse.json();
    assert.deepStrictEqual(files.length, 1);
    assert.deepStrictEqual(files[0].episode_number, 1);

    const episodesAfterScanResponse = await ctx.app.request("/api/anime/20/episodes", {
      headers: { Cookie: sessionCookie },
    });

    const episodesAfterScan = await episodesAfterScanResponse.json();
    assert.deepStrictEqual(episodesAfterScan[0].downloaded, true);

    const statsResponse = await ctx.app.request("/api/library/stats", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(await statsResponse.json(), {
      downloaded_episodes: 1,
      downloaded_percent: 0,
      missing_episodes: 219,
      monitored_anime: 1,
      recent_downloads: 0,
      rss_feeds: 0,
      total_anime: 1,
      total_episodes: 220,
      up_to_date_anime: 0,
    });
  });
});

itWithTestContext("rss, wanted, rename, and download helper endpoints work", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    await withTempDir(async (importFolder) => {
      const currentConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      const currentConfig = await currentConfigResponse.json();

      await ctx.app.request("/api/system/config", {
        body: JSON.stringify({
          ...currentConfig,
          downloads: {
            ...currentConfig.downloads,
            root_path: importFolder,
          },
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const addAnimeResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 11061,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: rootFolder,
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const addedAnime = await addAnimeResponse.json();

      await writeTextFile(
        `${addedAnime.root_folder}/Hunter x Hunter (2011) - 001.mkv`,
        "episode file",
      );
      const initialAnimeScan = await ctx.app.request("/api/anime/11061/episodes/scan", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });
      const acceptedInitialAnimeScan = await expectAcceptedTaskResponse(initialAnimeScan);
      await waitForAnimeScanTask({
        animeId: 11061,
        ctx,
        sessionCookie,
        taskId: acceptedInitialAnimeScan.task_id,
      });

      const rssAdd = await ctx.app.request("/api/rss", {
        body: JSON.stringify({
          anime_id: 11061,
          name: "Primary",
          url: "https://example.com/feed.xml",
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(rssAdd["status"], 200);

      const rssList = await ctx.app.request("/api/rss", {
        headers: { Cookie: sessionCookie },
      });

      const feeds = await rssList.json();
      assert.deepStrictEqual(feeds.length, 1);
      assert.deepStrictEqual(feeds[0].anime_id, 11061);

      const client = createClient({ url: `file:${ctx.databaseFile}` });
      try {
        await client.execute({
          sql: "update episodes set aired = ? where anime_id = ? and number = ?",
          args: ["2999-01-01T00:00:00.000Z", 11061, 2],
        });
        await client.execute({
          sql: "update episodes set aired = null where anime_id = ? and number = ?",
          args: [11061, 3],
        });
      } finally {
        client.close();
      }

      const wanted = await ctx.app.request("/api/wanted/missing?limit=20", {
        headers: { Cookie: sessionCookie },
      });

      const missing = await wanted.json();
      assert(missing.length > 0);
      assert.deepStrictEqual(missing[0].anime_id, 11061);
      assert.deepStrictEqual(
        missing.some((item: { episode_number: number }) => item.episode_number === 2),
        false,
      );
      assert.deepStrictEqual(
        missing.some((item: { episode_number: number }) => item.episode_number === 3),
        false,
      );

      const renamePreview = await ctx.app.request("/api/anime/11061/rename-preview", {
        headers: { Cookie: sessionCookie },
      });

      const preview = await renamePreview.json();
      assert.deepStrictEqual(preview.length, 1);
      assert.match(preview[0].new_filename, /Hunter x Hunter/);

      const renameExec = await ctx.app.request("/api/anime/11061/rename", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });

      assert.deepStrictEqual(renameExec["status"], 200);
      assert.deepStrictEqual((await renameExec.json()).renamed, 1);

      await writeTextFile(`${importFolder}/import-me-002.mkv`, "video import");

      const importScan = await ctx.app.request("/api/library/import/scan", {
        body: JSON.stringify({ anime_id: 11061, path: importFolder }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const scanBody = await importScan.json();
      assert.deepStrictEqual(scanBody.files.length, 1);
      assert.deepStrictEqual(scanBody.files[0].episode_number, 2);

      const importExecute = await ctx.app.request("/api/library/import", {
        body: JSON.stringify({
          files: [
            {
              anime_id: 11061,
              episode_number: 2,
              source_path: `${importFolder}/import-me-002.mkv`,
            },
          ],
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const acceptedImport = await expectAcceptedTaskResponse(importExecute);
      const completedImportTask = await waitForLibraryImportTask({
        ctx,
        sessionCookie,
        taskId: acceptedImport.task_id,
      });
      assert.deepStrictEqual(completedImportTask.payload?.imported, 1);

      const releaseSearch = await ctx.app.request("/api/search/releases?query=hunter", {
        headers: { Cookie: sessionCookie },
      });

      const releaseBody = await releaseSearch.json();
      assert(releaseBody.results.length >= 1);

      const episodeSearch = await ctx.app.request("/api/search/episode/11061/2", {
        headers: { Cookie: sessionCookie },
      });

      const episodeSearchBody = await episodeSearch.json();
      assert.deepStrictEqual(episodeSearchBody.length, 1);

      const triggerDownload = await ctx.app.request("/api/search/download", {
        body: JSON.stringify({
          anime_id: 11061,
          episode_number: 2,
          magnet: "magnet:?xt=urn:btih:test",
          title: "Hunter x Hunter - 02",
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(triggerDownload["status"], 200);

      const history = await ctx.app.request("/api/downloads/history", {
        headers: { Cookie: sessionCookie },
      });

      const historyBody = await history.json();
      assert.deepStrictEqual(historyBody.length, 1);

      const downloadId = historyBody[0].id;

      const pauseResponse = await ctx.app.request(`/api/downloads/${downloadId}/pause`, {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });

      assert.deepStrictEqual(pauseResponse["status"], 200);

      const resumeResponse = await ctx.app.request(`/api/downloads/${downloadId}/resume`, {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });

      assert.deepStrictEqual(resumeResponse["status"], 200);

      const retryResponse = await ctx.app.request(`/api/downloads/${downloadId}/retry`, {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });

      assert.deepStrictEqual(retryResponse["status"], 200);

      const syncResponse = await ctx.app.request("/api/downloads/sync", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });

      const acceptedSync = await expectAcceptedTaskResponse(syncResponse);
      await waitForSystemTask({
        ctx,
        sessionCookie,
        taskId: acceptedSync.task_id,
      });

      const reconcileResponse = await ctx.app.request(`/api/downloads/${downloadId}/reconcile`, {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });

      assert.deepStrictEqual(reconcileResponse["status"], 409);

      const filteredLogs = await ctx.app.request(
        "/api/system/logs?event_type=downloads.triggered&level=success&page=1",
        {
          headers: { Cookie: sessionCookie },
        },
      );

      assert.deepStrictEqual(filteredLogs["status"], 200);
      const filteredLogsBody = await filteredLogs.json();
      assert(filteredLogsBody.logs.length >= 1);
      assert.deepStrictEqual(
        filteredLogsBody.logs.every(
          (log: { event_type: string; level: string }) =>
            log.event_type === "downloads.triggered" && log.level === "success",
        ),
        true,
      );

      const exportLogs = await ctx.app.request(
        "/api/system/logs/export?event_type=downloads.triggered&format=csv",
        {
          headers: { Cookie: sessionCookie },
        },
      );

      assert.deepStrictEqual(exportLogs["status"], 200);
      assert.deepStrictEqual((await exportLogs.text()).includes("downloads.triggered"), true);

      const jobsResponse = await ctx.app.request("/api/system/jobs", {
        headers: { Cookie: sessionCookie },
      });

      assert.deepStrictEqual(jobsResponse["status"], 200);
      assert.deepStrictEqual(Array.isArray(await jobsResponse.json()), true);

      const eventsResponse = await ctx.app.request("/api/downloads/events", {
        headers: { Cookie: sessionCookie },
      });

      assert.deepStrictEqual(eventsResponse["status"], 200);
      const events = await eventsResponse.json();
      assert.deepStrictEqual(Array.isArray(events.events), true);
      assert.deepStrictEqual(typeof events.total, "number");
      assert.deepStrictEqual(typeof events.has_more, "boolean");
      assert.deepStrictEqual(
        typeof events.next_cursor === "string" || events.next_cursor === undefined,
        true,
      );
      assert.deepStrictEqual(events.events.length >= 1, true);
      assert.deepStrictEqual(
        events.events.some(
          (event: { anime_title?: string; download_id?: number; torrent_name?: string }) =>
            event.download_id === downloadId &&
            typeof event.anime_title === "string" &&
            typeof event.torrent_name === "string",
        ),
        true,
      );

      const filteredEventsResponse = await ctx.app.request(
        `/api/downloads/events?download_id=${downloadId}&limit=5`,
        {
          headers: { Cookie: sessionCookie },
        },
      );

      assert.deepStrictEqual(filteredEventsResponse["status"], 200);
      const filteredEvents = await filteredEventsResponse.json();
      assert.deepStrictEqual(filteredEvents.limit, 5);
      assert.deepStrictEqual(filteredEvents.events.length >= 1, true);
      assert.deepStrictEqual(
        filteredEvents.events.every(
          (event: { download_id?: number }) => event.download_id === downloadId,
        ),
        true,
      );

      const cursorFilteredEventsResponse = filteredEvents.next_cursor
        ? await ctx.app.request(
            `/api/downloads/events?download_id=${downloadId}&limit=5&cursor=${filteredEvents.next_cursor}&direction=next`,
            {
              headers: { Cookie: sessionCookie },
            },
          )
        : undefined;

      if (cursorFilteredEventsResponse) {
        assert.deepStrictEqual(cursorFilteredEventsResponse["status"], 200);
        const cursorFilteredEvents = await cursorFilteredEventsResponse.json();
        assert.deepStrictEqual(Array.isArray(cursorFilteredEvents.events), true);
      }

      const statusFilteredEventsResponse = await ctx.app.request(
        "/api/downloads/events?status=queued&limit=10",
        {
          headers: { Cookie: sessionCookie },
        },
      );

      assert.deepStrictEqual(statusFilteredEventsResponse["status"], 200);
      const statusFilteredEvents = await statusFilteredEventsResponse.json();
      assert.deepStrictEqual(statusFilteredEvents.events.length >= 1, true);
      assert.deepStrictEqual(
        statusFilteredEvents.events.every(
          (event: { from_status?: string; to_status?: string }) =>
            event.from_status === "queued" || event.to_status === "queued",
        ),
        true,
      );
      assert.deepStrictEqual(
        typeof statusFilteredEvents.next_cursor === "string" ||
          statusFilteredEvents.next_cursor === undefined,
        true,
      );

      const exportEventsJsonResponse = await ctx.app.request(
        `/api/downloads/events/export?download_id=${downloadId}&limit=5&order=asc&format=json`,
        {
          headers: { Cookie: sessionCookie },
        },
      );

      assert.deepStrictEqual(exportEventsJsonResponse["status"], 200);
      assert.deepStrictEqual(
        exportEventsJsonResponse.headers.get("content-type"),
        "application/json; charset=utf-8",
      );
      assert.deepStrictEqual(exportEventsJsonResponse.headers.get("x-bakarr-export-order"), "asc");
      const exportEventsJson = await exportEventsJsonResponse.json();
      assert.deepStrictEqual(Array.isArray(exportEventsJson.events), true);
      assert.deepStrictEqual(typeof exportEventsJson.total, "number");
      assert.deepStrictEqual(typeof exportEventsJson.exported, "number");
      assert.deepStrictEqual(typeof exportEventsJson.truncated, "boolean");
      assert.deepStrictEqual(typeof exportEventsJson.generated_at, "string");
      assert.deepStrictEqual(
        exportEventsJson.events.every(
          (event: { download_id?: number }) => event.download_id === downloadId,
        ),
        true,
      );

      const exportEventsCsvResponse = await ctx.app.request(
        `/api/downloads/events/export?download_id=${downloadId}&limit=5&format=csv`,
        {
          headers: { Cookie: sessionCookie },
        },
      );

      assert.deepStrictEqual(exportEventsCsvResponse["status"], 200);
      assert.deepStrictEqual(
        exportEventsCsvResponse.headers.get("content-type"),
        "text/csv; charset=utf-8",
      );
      assert.deepStrictEqual(exportEventsCsvResponse.headers.get("x-bakarr-export-limit"), "5");
      const exportEventsCsvBody = await exportEventsCsvResponse.text();
      assert.deepStrictEqual(exportEventsCsvBody.includes("id,created_at,event_type"), true);
      assert.deepStrictEqual(exportEventsCsvBody.split("\n").length >= 2, true);

      const dashboardResponse = await ctx.app.request("/api/system/dashboard", {
        headers: { Cookie: sessionCookie },
      });

      assert.deepStrictEqual(dashboardResponse["status"], 200);
      const dashboard = await dashboardResponse.json();
      assert.deepStrictEqual(typeof dashboard.queued_downloads, "number");
      assert.deepStrictEqual(Array.isArray(dashboard.recent_download_events), true);
      assert.deepStrictEqual(
        dashboard.recent_download_events.some(
          (event: { anime_title?: string; torrent_name?: string }) =>
            typeof event.anime_title === "string" && typeof event.torrent_name === "string",
        ),
        true,
      );

      const deleteResponse = await ctx.app.request(`/api/downloads/${downloadId}`, {
        headers: { Cookie: sessionCookie },
        method: "DELETE",
      });

      assert.deepStrictEqual(deleteResponse["status"], 200);

      const historyAfterDelete = await ctx.app.request("/api/downloads/history", {
        headers: { Cookie: sessionCookie },
      });

      assert.deepStrictEqual((await historyAfterDelete.json()).length, 0);

      const calendar = await ctx.app.request(
        `/api/calendar?start=${encodeURIComponent(
          new Date(0).toISOString(),
        )}&end=${encodeURIComponent(new Date(Date.now() + 86400000).toISOString())}`,
        {
          headers: { Cookie: sessionCookie },
        },
      );

      assert.deepStrictEqual(calendar["status"], 200);
      assert((await calendar.json()).length >= 1);
    });
  });
});

itWithTestContext("rss task and missing-search task queue downloads", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const rssUrl = "https://feeds.example/naruto.xml";

    await ctx.app.request("/api/rss", {
      body: JSON.stringify({ anime_id: 20, url: rssUrl }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const rssTask = await ctx.app.request("/api/system/tasks/rss", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    const acceptedRss = await expectAcceptedTaskResponse(rssTask);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedRss.task_id,
    });

    const statusAfterRss = await ctx.app.request("/api/system/status", {
      headers: { Cookie: sessionCookie },
    });

    const statusBody = await statusAfterRss.json();
    assert.deepStrictEqual(typeof statusBody.last_rss, "string");

    const queueAfterRss = await ctx.app.request("/api/downloads/queue", {
      headers: { Cookie: sessionCookie },
    });

    const queueRssBody = await queueAfterRss.json();
    assert.deepStrictEqual(queueRssBody.length, 1);

    const metricsResponse = await ctx.app.request("/api/metrics", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(metricsResponse["status"], 200);
    const metricsText = await metricsResponse.text();
    assert.deepStrictEqual(metricsText.includes("bakarr_total_anime"), true);
    assert.deepStrictEqual(metricsText.includes("bakarr_active_download_items"), true);
    assert.deepStrictEqual(
      metricsText.includes('bakarr_background_worker_daemon_running{worker="download_sync"}'),
      true,
    );
    assert.deepStrictEqual(
      metricsText.includes(
        'bakarr_background_worker_runs_total{status="success",worker="download_sync"}',
      ),
      true,
    );
    assert.deepStrictEqual(
      metricsText.includes(
        'bakarr_http_requests_total{method="GET",route="/api/metrics",status="200"} 1',
      ),
      false,
    );
    assert.deepStrictEqual(
      metricsText.includes(
        'bakarr_http_request_duration_ms_bucket{method="GET",route="/api/metrics",status="200",le="10"}',
      ),
      false,
    );

    const searchMissing = await ctx.app.request("/api/downloads/search-missing", {
      body: JSON.stringify({ anime_id: 20 }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const acceptedSearchMissing = await expectAcceptedTaskResponse(searchMissing);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedSearchMissing.task_id,
    });

    const history = await ctx.app.request("/api/downloads/history", {
      headers: { Cookie: sessionCookie },
    });

    const historyBody = await history.json();
    assert(historyBody.length >= 1);

    const eventFeedResponse = await ctx.app.request(
      "/api/downloads/events?download_id=1&limit=20",
      {
        headers: { Cookie: sessionCookie },
      },
    );

    assert.deepStrictEqual(eventFeedResponse["status"], 200);
    const eventFeed = await eventFeedResponse.json();
    assert.deepStrictEqual(Array.isArray(eventFeed.events), true);
    const rssOrMissingEvent = eventFeed.events.find(
      (event: {
        event_type: string;
        metadata_json?:
          | {
              source_metadata?:
                | {
                    indexer?: string;
                    source_url?: string;
                    trusted?: boolean;
                  }
                | undefined;
            }
          | undefined;
      }) =>
        event.event_type === "download.rss.queued" ||
        event.event_type === "download.search_missing.queued",
    );
    assert(rssOrMissingEvent);
    assert.deepStrictEqual(rssOrMissingEvent?.metadata_json?.source_metadata?.indexer, "Nyaa");
    assert.deepStrictEqual(
      typeof rssOrMissingEvent?.metadata_json?.source_metadata?.trusted,
      "boolean",
    );
    assert.deepStrictEqual(
      rssOrMissingEvent?.metadata_json?.source_metadata?.source_url?.startsWith(
        "https://nyaa.si/view/",
      ),
      true,
    );

    const scanTask = await ctx.app.request("/api/system/tasks/scan", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    const acceptedSystemScan = await expectAcceptedTaskResponse(scanTask);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedSystemScan.task_id,
    });

    const statusAfterScan = await ctx.app.request("/api/system/status", {
      headers: { Cookie: sessionCookie },
    });

    const scanStatusBody = await statusAfterScan.json();
    assert.deepStrictEqual(typeof scanStatusBody.last_scan, "string");

    const episodeSearch = await ctx.app.request("/api/search/episode/20/1", {
      headers: { Cookie: sessionCookie },
    });

    const episodeSearchBody = await episodeSearch.json();
    assert.deepStrictEqual(episodeSearch["status"], 200);
    assert(episodeSearchBody.length >= 1);
    assert(
      episodeSearchBody[0].download_action.Accept ||
        episodeSearchBody[0].download_action.Upgrade ||
        episodeSearchBody[0].download_action.Reject,
    );
  });
});

itWithTestContext("missing-search ignores episodes that have not aired yet", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const client = createClient({ url: `file:${ctx.databaseFile}` });
    try {
      await client.execute({
        sql: "update episodes set aired = ? where anime_id = ? and number = ?",
        args: ["2999-01-01T00:00:00.000Z", 20, 2],
      });
    } finally {
      client.close();
    }

    const rssUrl = "https://feeds.example/naruto.xml";

    await ctx.app.request("/api/rss", {
      body: JSON.stringify({ anime_id: 20, url: rssUrl }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const searchMissing = await ctx.app.request("/api/downloads/search-missing", {
      body: JSON.stringify({ anime_id: 20 }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const acceptedSearchMissing = await expectAcceptedTaskResponse(searchMissing);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedSearchMissing.task_id,
    });

    const history = await ctx.app.request("/api/downloads/history", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(history["status"], 200);
    const downloads = await history.json();

    assert.deepStrictEqual(
      downloads.some((download: { episode_number: number }) => download.episode_number === 2),
      false,
    );
  });
});

itWithTestContext("wanted and global missing search ignore unmonitored anime", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    const addAnimeResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: false,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert.deepStrictEqual(addAnimeResponse["status"], 200);

    const wantedResponse = await ctx.app.request("/api/wanted/missing?limit=20", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(wantedResponse["status"], 200);
    assert.deepStrictEqual(await wantedResponse.json(), []);

    const globalSearchResponse = await ctx.app.request("/api/downloads/search-missing", {
      body: JSON.stringify({}),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const acceptedGlobalSearch = await expectAcceptedTaskResponse(globalSearchResponse);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedGlobalSearch.task_id,
    });

    const historyResponse = await ctx.app.request("/api/downloads/history", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(historyResponse["status"], 200);
    assert.deepStrictEqual(await historyResponse.json(), []);

    const directSearchResponse = await ctx.app.request("/api/downloads/search-missing", {
      body: JSON.stringify({ anime_id: 20 }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const acceptedDirectSearch = await expectAcceptedTaskResponse(directSearchResponse);
    await waitForSystemTask({
      ctx,
      sessionCookie,
      taskId: acceptedDirectSearch.task_id,
    });

    const directHistoryResponse = await ctx.app.request("/api/downloads/history", {
      headers: { Cookie: sessionCookie },
    });

    assert.deepStrictEqual(directHistoryResponse["status"], 200);
    const downloads = await directHistoryResponse.json();
    assert.deepStrictEqual(downloads.length > 0, true);
    assert.deepStrictEqual(downloads[0].anime_id, 20);
  });
});

itWithTestContext("manual import succeeds for files outside configured roots", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    await withTempDir(async (importFolder) => {
      const addAnimeResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 20,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: rootFolder,
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(addAnimeResponse["status"], 200);

      const sourcePath = `${importFolder}/manual-import-001.mkv`;
      await writeTextFile(sourcePath, "video import");

      const importScan = await ctx.app.request("/api/library/import/scan", {
        body: JSON.stringify({ anime_id: 20, path: importFolder }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(importScan["status"], 200);
      const scanBody = await importScan.json();
      assert.deepStrictEqual(scanBody.files.length, 1);

      const importExecute = await ctx.app.request("/api/library/import", {
        body: JSON.stringify({
          files: [
            {
              anime_id: 20,
              episode_number: 1,
              source_path: sourcePath,
            },
          ],
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const acceptedImport = await expectAcceptedTaskResponse(importExecute);
      const completedImportTask = await waitForLibraryImportTask({
        ctx,
        sessionCookie,
        taskId: acceptedImport.task_id,
      });
      assert.deepStrictEqual(completedImportTask.payload?.imported, 1);
      assert.deepStrictEqual(completedImportTask.payload?.failed, 0);
    });
  });
});

itWithTestContext("events endpoint streams initial state and live notifications", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    const addAnimeResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert.deepStrictEqual(addAnimeResponse["status"], 200);

    await withEventsStreamReader(ctx, sessionCookie, async (reader) => {
      const initialChunk = await readUntilMatch(reader, /"type":"DownloadProgress"/);
      assert.match(initialChunk, /"type":"DownloadProgress"/);
      assert.match(initialChunk, /"downloads":\[\]/);

      const triggerDownload = await ctx.app.request("/api/search/download", {
        body: JSON.stringify({
          anime_id: 20,
          episode_number: 1,
          magnet: "magnet:?xt=urn:btih:test-events",
          title: "Naruto - 01",
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(triggerDownload["status"], 200);

      const streamed = await readUntilMatch(
        reader,
        /"type":"DownloadStarted"|"type":"DownloadProgress"/,
      );

      assert.match(streamed, /"type":"DownloadStarted"|"type":"DownloadProgress"/);
    });
  });
});

itWithTestContext(
  "events stream can reconnect after disconnect and still receive updates",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (rootFolder) => {
      const addAnimeResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 20,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: rootFolder,
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(addAnimeResponse["status"], 200);

      await withEventsStreamReader(ctx, sessionCookie, async (firstReader) => {
        await readUntilMatch(firstReader, /"type":"DownloadProgress"/);
      });

      await new Promise((resolve) => setTimeout(resolve, 25));

      await withEventsStreamReader(ctx, sessionCookie, async (secondReader) => {
        const secondInitial = await readUntilMatch(secondReader, /"type":"DownloadProgress"/);
        assert.match(secondInitial, /"type":"DownloadProgress"/);

        const triggerDownload = await ctx.app.request("/api/search/download", {
          body: JSON.stringify({
            anime_id: 20,
            episode_number: 1,
            magnet: "magnet:?xt=urn:btih:test-events-reconnect",
            title: "Naruto - 01",
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        assert.deepStrictEqual(triggerDownload["status"], 200);

        const streamed = await readUntilMatch(
          secondReader,
          /"type":"DownloadStarted"|"type":"DownloadProgress"/,
        );

        assert.match(streamed, /"type":"DownloadStarted"|"type":"DownloadProgress"/);
      });
    });
  },
);

itWithTestContext("events stream emits RSS and library scan progress updates", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    const addAnimeResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert.deepStrictEqual(addAnimeResponse["status"], 200);

    await writeTextFile(`${rootFolder}/Naruto - 001.mkv`, "video");

    const rssUrl = "https://feeds.example/naruto.xml";

    const addFeedResponse = await ctx.app.request("/api/rss", {
      body: JSON.stringify({ anime_id: 20, url: rssUrl }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert.deepStrictEqual(addFeedResponse["status"], 200);

    await withEventsStreamReader(ctx, sessionCookie, async (reader) => {
      await readUntilMatch(reader, /"type":"DownloadProgress"/);

      const rssTask = await ctx.app.request("/api/system/tasks/rss", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });

      const acceptedRss = await expectAcceptedTaskResponse(rssTask);
      await waitForSystemTask({
        ctx,
        sessionCookie,
        taskId: acceptedRss.task_id,
      });

      const rssProgress = await readUntilMatch(reader, /"type":"RssCheckProgress"/);
      assert.match(rssProgress, /"type":"RssCheckProgress"/);

      const scanTask = await ctx.app.request("/api/system/tasks/scan", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });

      const acceptedScan = await expectAcceptedTaskResponse(scanTask);
      await waitForSystemTask({
        ctx,
        sessionCookie,
        taskId: acceptedScan.task_id,
      });

      const scanProgress = await readUntilMatch(reader, /"type":"LibraryScanProgress"/);
      assert.match(scanProgress, /"type":"LibraryScanProgress"/);
    });
  });
});

itWithTestContext(
  "batch reconcile imports multiple completed episodes into the anime library",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (animeRoot) => {
      await withTempDir(async (completedRoot) => {
        const addAnimeResponse = await ctx.app.request("/api/anime", {
          body: JSON.stringify({
            id: 20,
            monitor_and_search: false,
            monitored: true,
            profile_name: "Default",
            release_profile_ids: [],
            root_folder: animeRoot,
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(addAnimeResponse["status"], 200);

        const magnetHash = "abcdef1234567890abcdef1234567890abcdef12";
        const triggerDownloadResponse = await ctx.app.request("/api/search/download", {
          body: JSON.stringify({
            anime_id: 20,
            episode_number: 1,
            is_batch: true,
            magnet: `magnet:?xt=urn:btih:${magnetHash}`,
            title: "Naruto Batch 01-02",
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assert.deepStrictEqual(triggerDownloadResponse["status"], 200);

        const batchFolder = `${completedRoot}/batch`;
        await mkdirPath(batchFolder, { recursive: true });
        await writeTextFile(`${batchFolder}/Naruto - 001.mkv`, "episode-1");
        await writeTextFile(`${batchFolder}/Naruto - 002.mkv`, "episode-2");

        const client = createClient({ url: `file:${ctx.databaseFile}` });
        try {
          await client.execute({
            sql: "update downloads set content_path = ?, save_path = ?, status = ?, external_state = ?, is_batch = 1 where info_hash = ?",
            args: [batchFolder, batchFolder, "completed", "completed", magnetHash],
          });
        } finally {
          client.close();
        }

        const reconcileResponse = await ctx.app.request("/api/downloads/1/reconcile", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });
        assert.deepStrictEqual(reconcileResponse["status"], 200);

        const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
          headers: { Cookie: sessionCookie },
        });
        assert.deepStrictEqual(episodesResponse["status"], 200);
        const episodes = await episodesResponse.json();
        assert.deepStrictEqual(episodes[0].downloaded, true);
        assert.deepStrictEqual(episodes[1].downloaded, true);
        assert.deepStrictEqual(episodes[0].file_path?.includes(`${animeRoot}/Naruto/`), true);
        assert.deepStrictEqual(episodes[1].file_path?.includes(`${animeRoot}/Naruto/`), true);

        const historyResponse = await ctx.app.request("/api/downloads/history", {
          headers: { Cookie: sessionCookie },
        });
        assert.deepStrictEqual(historyResponse["status"], 200);
        const history = await historyResponse.json();
        assert.deepStrictEqual(history[0]["status"], "imported");
        assert.deepStrictEqual(history[0].is_batch, true);
      });
    });
  },
);

itWithTestContext("batch reconcile marks already-imported episodes as reconciled", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (animeRoot) => {
    await withTempDir(async (completedRoot) => {
      const addAnimeResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 20,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: animeRoot,
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(addAnimeResponse["status"], 200);
      const anime = await addAnimeResponse.json();

      const existingEpisodeOne = `${anime.root_folder}/Naruto - 001.mkv`;
      const existingEpisodeTwo = `${anime.root_folder}/Naruto - 002.mkv`;
      await writeTextFile(existingEpisodeOne, "episode-1");
      await writeTextFile(existingEpisodeTwo, "episode-2");

      const mapEpisodeOne = await ctx.app.request("/api/anime/20/episodes/1/map", {
        body: JSON.stringify({ file_path: existingEpisodeOne }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(mapEpisodeOne["status"], 200);

      const mapEpisodeTwo = await ctx.app.request("/api/anime/20/episodes/2/map", {
        body: JSON.stringify({ file_path: existingEpisodeTwo }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(mapEpisodeTwo["status"], 200);

      const magnetHash = "abcdef1234567890abcdef1234567890abcdef12";
      const triggerDownloadResponse = await ctx.app.request("/api/search/download", {
        body: JSON.stringify({
          anime_id: 20,
          episode_number: 1,
          is_batch: true,
          magnet: `magnet:?xt=urn:btih:${magnetHash}`,
          title: "Naruto Batch 01-02",
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      assert.deepStrictEqual(triggerDownloadResponse["status"], 200);

      const batchFolder = `${completedRoot}/batch`;
      await mkdirPath(batchFolder, { recursive: true });
      await writeTextFile(`${batchFolder}/Naruto - 001.mkv`, "episode-1");
      await writeTextFile(`${batchFolder}/Naruto - 002.mkv`, "episode-2");

      const client = createClient({ url: `file:${ctx.databaseFile}` });
      try {
        await client.execute({
          sql: "update downloads set content_path = ?, save_path = ?, status = ?, external_state = ?, is_batch = 1 where info_hash = ?",
          args: [batchFolder, batchFolder, "completed", "completed", magnetHash],
        });
      } finally {
        client.close();
      }

      const reconcileResponse = await ctx.app.request("/api/downloads/1/reconcile", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });
      assert.deepStrictEqual(reconcileResponse["status"], 200);

      const verifyClient = createClient({ url: `file:${ctx.databaseFile}` });
      try {
        const result = await verifyClient.execute(
          "select status, reconciled_at as reconciledAt from downloads where id = 1",
        );
        const row = result.rows[0];
        assert.deepStrictEqual(isRecord(row), true);
        if (!isRecord(row)) {
          return;
        }
        assert.deepStrictEqual(row["status"], "imported");
        assert.deepStrictEqual(typeof row["reconciledAt"], "string");
      } finally {
        verifyClient.close();
      }
    });
  });
});

itWithTestContext(
  "add anime without root folder falls back to configured library path",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (libraryPath) => {
      const currentConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      const currentConfig = await currentConfigResponse.json();

      await ctx.app.request("/api/system/config", {
        body: JSON.stringify({
          ...currentConfig,
          library: {
            ...currentConfig.library,
            library_path: libraryPath,
          },
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const addResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 20,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: "",
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(addResponse["status"], 200);
      const anime = await addResponse.json();
      assert.deepStrictEqual(anime.root_folder.startsWith(libraryPath), true);
      assert.deepStrictEqual(anime.root_folder, `${libraryPath}/Naruto`);
    });
  },
);

itWithTestContext(
  "importing an unmapped folder maps the anime to that library folder",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (libraryPath) => {
      const currentConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      const currentConfig = await currentConfigResponse.json();

      await ctx.app.request("/api/system/config", {
        body: JSON.stringify({
          ...currentConfig,
          library: {
            ...currentConfig.library,
            library_path: libraryPath,
          },
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      const folderName = "Naruto Fansub";
      const folderPath = `${libraryPath}/${folderName}`;
      await mkdirPath(folderPath, { recursive: true });
      await writeTextFile(`${folderPath}/[SubsPlease] Naruto - 001.mkv`, "test");

      const addResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 20,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: "",
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(addResponse["status"], 200);

      const beforeImport = await ctx.app.request("/api/library/unmapped", {
        headers: { Cookie: sessionCookie },
      });
      assert.deepStrictEqual(beforeImport["status"], 200);
      const beforeState = await beforeImport.json();
      assert.deepStrictEqual(beforeState.folders.length, 1);
      assert.deepStrictEqual(beforeState.folders[0].name, folderName);

      const importResponse = await ctx.app.request("/api/library/unmapped/import", {
        body: JSON.stringify({ anime_id: 20, folder_name: folderName }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(importResponse["status"], 200);

      const animeResponse = await ctx.app.request("/api/anime/20", {
        headers: { Cookie: sessionCookie },
      });
      const anime = await animeResponse.json();
      assert.deepStrictEqual(anime.root_folder, folderPath);

      const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
        headers: { Cookie: sessionCookie },
      });
      const episodeRows = await episodesResponse.json();
      assert.deepStrictEqual(
        episodeRows.some(
          (episode: { downloaded: boolean; number: number; file_path?: string }) =>
            episode.number === 1 && episode.downloaded && episode.file_path?.includes(folderName),
        ),
        true,
      );

      const afterImport = await ctx.app.request("/api/library/unmapped", {
        headers: { Cookie: sessionCookie },
      });
      assert.deepStrictEqual(afterImport["status"], 200);
      const afterState = await afterImport.json();
      assert.deepStrictEqual(afterState.folders.length, 0);
    });
  },
);

itWithTestContext("adding an anime can keep an existing folder as its root", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (libraryPath) => {
    const existingFolder = `${libraryPath}/Naruto Fansub`;
    await mkdirPath(existingFolder, { recursive: true });

    const addResponse = await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: existingFolder,
        use_existing_root: true,
      }),
      headers: {
        Cookie: sessionCookie,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    assert.deepStrictEqual(addResponse["status"], 200);
    const anime = await addResponse.json();
    assert.deepStrictEqual(anime.root_folder, existingFolder);
  });
});

itWithTestContext(
  "adding an anime with an already-mapped existing root returns conflict",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (libraryPath) => {
      const existingFolder = `${libraryPath}/Naruto Fansub`;
      await mkdirPath(existingFolder, { recursive: true });

      const firstAddResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 20,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: existingFolder,
          use_existing_root: true,
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(firstAddResponse["status"], 200);

      const secondAddResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 11061,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: existingFolder,
          use_existing_root: true,
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(secondAddResponse["status"], 409);
    });
  },
);

itWithTestContext(
  "add anime with explicit root folder creates anime-specific folder by default",
  async (ctx) => {
    const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

    await withTempDir(async (rootFolder) => {
      const addResponse = await ctx.app.request("/api/anime", {
        body: JSON.stringify({
          id: 11061,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: rootFolder,
        }),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      assert.deepStrictEqual(addResponse["status"], 200);
      const anime = await addResponse.json();
      assert.deepStrictEqual(anime.root_folder, `${rootFolder}/Hunter x Hunter (2011)`);

      const stats = await statPath(anime.root_folder);
      assert.deepStrictEqual(stats.isDirectory(), true);
    });
  },
);

itWithTestContext("import scan matches local anime by parsed filename", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (narutoFolder) => {
    await withTempDir(async (hxhFolder) => {
      await withTempDir(async (importFolder) => {
        const spyFolder = `${hxhFolder}-spy`;
        try {
          await ctx.app.request("/api/anime", {
            body: JSON.stringify({
              id: 20,
              monitor_and_search: false,
              monitored: true,
              profile_name: "Default",
              release_profile_ids: [],
              root_folder: narutoFolder,
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          });
          await ctx.app.request("/api/anime", {
            body: JSON.stringify({
              id: 11061,
              monitor_and_search: false,
              monitored: true,
              profile_name: "Default",
              release_profile_ids: [],
              root_folder: hxhFolder,
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          });
          await ctx.app.request("/api/anime", {
            body: JSON.stringify({
              id: 140960,
              monitor_and_search: false,
              monitored: true,
              profile_name: "Default",
              release_profile_ids: [],
              root_folder: spyFolder,
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          });

          await writeTextFile(
            `${importFolder}/[SubsPlease] Hunter x Hunter (2011) - 002 [1080p].mkv`,
            "video",
          );
          await writeTextFile(
            `${importFolder}/[SubsPlease] Spy x Family Season 2 - 03 [1080p].mkv`,
            "video",
          );

          const scanResponse = await ctx.app.request("/api/library/import/scan", {
            body: JSON.stringify({ path: importFolder }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          });

          assert.deepStrictEqual(scanResponse["status"], 200);
          const scanBody = await scanResponse.json();
          assert.deepStrictEqual(scanBody.files.length, 2);
          assert.deepStrictEqual(scanBody.files[0].matched_anime?.id, 11061);
          assert.deepStrictEqual(scanBody.files[0].suggested_candidate_id, 11061);
          assert.deepStrictEqual(scanBody.files[1].suggested_candidate_id, 140960);
        } finally {
          await removePath(spyFolder, { recursive: true }).catch(() => undefined);
        }
      });
    });
  });
});

itWithTestContext("bulk map accepts empty file path as unmap", async (ctx) => {
  const { sessionCookie } = await loginAsBootstrapAdmin(ctx);

  await withTempDir(async (rootFolder) => {
    await ctx.app.request("/api/anime", {
      body: JSON.stringify({
        id: 20,
        monitor_and_search: false,
        monitored: true,
        profile_name: "Default",
        release_profile_ids: [],
        root_folder: rootFolder,
      }),
      headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
      method: "POST",
    });

    const filePath = `${rootFolder}/Naruto - 001.mkv`;
    await writeTextFile(filePath, "video");

    await ctx.app.request("/api/anime/20/episodes/map/bulk", {
      body: JSON.stringify({
        mappings: [{ episode_number: 1, file_path: filePath }],
      }),
      headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
      method: "POST",
    });

    await ctx.app.request("/api/anime/20/episodes/map/bulk", {
      body: JSON.stringify({
        mappings: [{ episode_number: 1, file_path: "" }],
      }),
      headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
      method: "POST",
    });

    const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
      headers: { Cookie: sessionCookie },
    });
    const episodes = await episodesResponse.json();
    assert.deepStrictEqual(episodes[0].downloaded, false);
    assert.deepStrictEqual(episodes[0].file_path, undefined);
  });
});

const TEST_ANIME_METADATA = new Map([
  [
    20,
    {
      id: 20,
      malId: 20,
      title: { romaji: "Naruto", english: "Naruto", native: "NARUTO -ナルト-" },
      format: "TV",
      status: "FINISHED",
      episodeCount: 220,
      score: 79,
      genres: ["Action", "Adventure"],
      studios: ["Pierrot"],
      coverImage: undefined,
      bannerImage: undefined,
      description: "Test anime",
      startDate: "2002-10-03",
      endDate: "2007-02-08",
    },
  ],
  [
    11061,
    {
      id: 11061,
      malId: 11061,
      title: {
        romaji: "Hunter x Hunter (2011)",
        english: "Hunter x Hunter",
        native: "HUNTER×HUNTER",
      },
      format: "TV",
      status: "FINISHED",
      episodeCount: 148,
      score: 89,
      genres: ["Action", "Adventure"],
      studios: ["Madhouse"],
      coverImage: undefined,
      bannerImage: undefined,
      description: "Test anime",
      startDate: "2011-10-02",
      endDate: "2014-09-24",
    },
  ],
  [
    140960,
    {
      id: 140960,
      title: { romaji: "Spy x Family Season 2" },
      format: "TV",
      status: "FINISHED",
      episodeCount: 12,
      score: 80,
      genres: ["Action", "Comedy"],
      studios: ["Wit Studio"],
      coverImage: undefined,
      bannerImage: undefined,
      description: "Test anime",
      startDate: "2023-10-07",
      endDate: "2023-12-23",
    },
  ],
]);

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/season\s*ii\b/gi, "season2")
    .replace(/season\s*iii\b/gi, "season3");
}

const testAniListLayer = Layer.succeed(AniListClient, {
  searchAnimeMetadata: (query: string) => {
    const results: AnimeSearchResult[] = [];
    const normalizedQuery = normalizeForSearch(query);
    for (const [id, meta] of TEST_ANIME_METADATA) {
      const normalizedRomaji = normalizeForSearch(meta.title.romaji);
      const normalizedEnglish = meta.title.english ? normalizeForSearch(meta.title.english) : "";
      if (
        normalizedRomaji.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedRomaji) ||
        (normalizedEnglish &&
          (normalizedEnglish.includes(normalizedQuery) ||
            normalizedQuery.includes(normalizedEnglish)))
      ) {
        results.push({
          already_in_library: false,
          cover_image: undefined,
          episode_count: meta.episodeCount,
          format: meta.format,
          id,
          status: meta["status"],
          title: meta.title,
        });
      }
    }
    return Effect.succeed(results);
  },
  getAnimeMetadataById: (id: number) =>
    Effect.succeed(Option.fromNullable(TEST_ANIME_METADATA.get(id))),
  getSeasonalAnime: () => Effect.succeed([]),
});

function deterministicHex(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(40, "0");
}

function makeTestRelease(title: string, overrides: Partial<ParsedRelease> = {}): ParsedRelease {
  const infoHash = overrides.infoHash ?? deterministicHex(title);
  return {
    group: "TestGroup",
    infoHash,
    isSeaDex: false,
    isSeaDexBest: false,
    leechers: 0,
    magnet: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(title)}`,
    pubDate: new Date().toISOString(),
    remake: false,
    resolution: "1080p",
    seeders: 10,
    size: "500 MiB",
    sizeBytes: 524_288_000,
    title,
    trusted: true,
    viewUrl: "https://nyaa.si/view/0",
    ...overrides,
  };
}

const TEST_SEADEX_ENTRIES = new Map<number, SeaDexEntry>([
  [
    20,
    {
      alID: 20,
      comparison: "https://releases.moe/compare/naruto",
      incomplete: false,
      notes: "Prefer the SeaDex best release when available.",
      releases: [
        {
          dualAudio: true,
          groupedUrl: "https://releases.moe/collection/naruto",
          infoHash: deterministicHex(NARUTO_RELEASE_TITLE),
          isBest: true,
          releaseGroup: "SubsPlease",
          tags: ["Best", "Dual Audio"],
          tracker: "Nyaa",
          url: "https://nyaa.si/view/123",
        },
      ],
    },
  ],
]);

const testRssLayer = Layer.succeed(RssClient, {
  fetchItems: (url: string) => {
    const query = decodeURIComponent(url).toLowerCase();
    const releases: ParsedRelease[] = [];
    if (query.includes("naruto")) {
      releases.push(makeTestRelease(NARUTO_RELEASE_TITLE));
    }
    if (query.includes("hunter")) {
      releases.push(
        makeTestRelease("[SubsPlease] Hunter x Hunter (2011) - 02 (1080p) [DEF456].mkv"),
      );
    }
    return Effect.succeed(releases);
  },
});

const testSeaDexLayer = Layer.succeed(SeaDexClient, {
  getEntryByAniListId: (aniListId: number) =>
    Effect.succeed(Option.fromNullable(TEST_SEADEX_ENTRIES.get(aniListId))),
});

const testJikanLayer = Layer.succeed(JikanClient, {
  getAnimeByMalId: () => Effect.succeed(Option.none()),
  getSeasonalAnime: () => Effect.succeed([]),
});

const testManamiLayer = Layer.succeed(ManamiClient, {
  getByAniListId: () => Effect.succeed(Option.none()),
  getByMalId: () => Effect.succeed(Option.none()),
  resolveAniListIdFromMalId: () => Effect.succeed(Option.none()),
  resolveMalIdFromAniListId: () => Effect.succeed(Option.none()),
  searchAnime: () => Effect.succeed([]),
});

async function createTestContext(options?: {
  jikanLayer?: Layer.Layer<JikanClient>;
  manamiLayer?: Layer.Layer<ManamiClient>;
  qbitLayer?: Layer.Layer<QBitTorrentClient>;
  rssLayer?: Layer.Layer<RssClient>;
  seadexLayer?: Layer.Layer<SeaDexClient>;
}) {
  const databaseFile = await makeTempFile({ suffix: ".sqlite" });
  const runtime = ManagedRuntime.make(
    makeApiLifecycleLayers(
      {
        bootstrapPassword: "admin",
        bootstrapUsername: "admin",
        databaseFile,
        port: 9999,
      },
      {
        aniListLayer: testAniListLayer,
        commandExecutorLayer: Layer.succeed(
          CommandExecutor.CommandExecutor,
          makeCommandExecutorStub((command) => {
            const name = commandName(command);
            const args = commandArgs(command);

            if (name === "df") {
              return Effect.succeed(
                "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 1000 250 750 25% /tmp",
              );
            }

            if (name === "ffprobe") {
              return Effect.succeed(
                args.includes("-version") ? "ffprobe version test" : '{"streams":[]}',
              );
            }

            return Effect.die(new Error(`unexpected command in test runtime: ${String(name)}`));
          }),
        ),
        ...(options?.qbitLayer ? { qbitLayer: options.qbitLayer } : {}),
        jikanLayer: options?.jikanLayer ?? testJikanLayer,
        manamiLayer: options?.manamiLayer ?? testManamiLayer,
        rssLayer: options?.rssLayer ?? testRssLayer,
        seadexLayer: options?.seadexLayer ?? testSeaDexLayer,
      },
    ).appLayer,
  );
  await runtime.runPromise(bootstrapProgram());
  const httpApp = await runtime.runPromise(createHttpApp());
  const webHandler = HttpApp.toWebHandlerRuntime(await runtime.runtime())(httpApp);
  const app = {
    request: (input: string | URL | Request, init?: RequestInit) => {
      if (typeof input === "string" && input.includes("/../")) {
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      }

      const request =
        input instanceof Request
          ? input
          : new Request(
              input instanceof URL
                ? input.toString()
                : new URL(input.replaceAll("/../", "/%2E%2E/"), "http://bakarr.local").toString(),
              init,
            );

      return webHandler(request);
    },
  };

  const bootstrapLoginResponse = await app.request("/api/auth/login", {
    body: JSON.stringify({ password: "admin", username: "admin" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const bootstrapSessionCookie = bootstrapLoginResponse.headers.get("set-cookie");

  assert(bootstrapSessionCookie);

  const currentConfigResponse = await app.request("/api/system/config", {
    headers: { Cookie: bootstrapSessionCookie },
  });
  const currentConfig = await currentConfigResponse.json();

  await app.request("/api/system/config", {
    body: JSON.stringify({
      ...currentConfig,
      library: {
        ...currentConfig.library,
        library_path: tmpdir(),
      },
    }),
    headers: {
      Cookie: bootstrapSessionCookie,
      "Content-Type": "application/json",
    },
    method: "PUT",
  });

  return {
    app,
    databaseFile,
    dispose: async () => {
      await runtime.dispose();
      await removePath(databaseFile);
    },
  };
}

function makeCommandExecutorStub(
  runAsString: (
    command: Parameters<CommandExecutor.CommandExecutor["string"]>[0],
  ) => Effect.Effect<string>,
): CommandExecutor.CommandExecutor {
  return {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    exitCode: () => Effect.die("exitCode not implemented for test"),
    lines: (command, _encoding) =>
      runAsString(command).pipe(
        Effect.map((value) => value.split(/\r?\n/).filter((line) => line.length > 0)),
      ),
    start: () => Effect.die("start not implemented for test"),
    stream: () => Stream.dieMessage("stream not implemented for test"),
    streamLines: () => Stream.dieMessage("streamLines not implemented for test"),
    string: (command, _encoding) => runAsString(command),
  };
}

async function makeTempDir() {
  return await mkdtemp(join(tmpdir(), "bakarr-api-test-"));
}

async function makeTempFile(options?: { readonly suffix?: string }) {
  const directory = await makeTempDir();
  const filePath = join(directory, `temp${options?.suffix ?? ""}`);
  await writeFile(filePath, "");
  return filePath;
}

async function mkdirPath(path: string, options?: { readonly recursive?: boolean }) {
  await mkdir(path, { recursive: options?.recursive });
}

async function removePath(path: string, options?: { readonly recursive?: boolean }) {
  await rm(path, { force: true, recursive: options?.recursive ?? false });
}

async function statPath(path: string) {
  return await stat(path);
}

async function writeBinaryFile(path: string, data: Uint8Array) {
  await writeFile(path, data);
}

async function writeTextFile(path: string, data: string) {
  await writeFile(path, data, "utf8");
}

function createClient(input: { readonly url: string }) {
  const databaseFile = toDatabaseFile(input.url);
  const scope = Effect.runSync(Scope.make());
  const clientContext = Effect.runSync(
    EffectLayer.buildWithScope(
      SqliteClient.layer({
        filename: databaseFile,
        readonly: false,
      }),
      scope,
    ),
  );
  const client = Context.get(clientContext, SqliteClient.SqliteClient);

  return {
    close() {
      Effect.runSync(Scope.close(scope, Exit.succeed(undefined)));
    },
    async execute(
      sqlOrStatement: { readonly args?: ReadonlyArray<unknown>; readonly sql: string } | string,
      args: ReadonlyArray<unknown> = [],
    ) {
      const statement =
        typeof sqlOrStatement === "string"
          ? { args, sql: sqlOrStatement }
          : { args: sqlOrStatement.args ?? [], sql: sqlOrStatement.sql };

      const rows = await Effect.runPromise(
        client.unsafe(statement.sql, statement.args).withoutTransform,
      );

      return { rows: rows.filter(isRecord) };
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toDatabaseFile(url: string) {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

async function waitForSql(
  client: ReturnType<typeof createClient>,
  sql: string,
  args: ReadonlyArray<unknown> | undefined,
  predicate: (rows: Array<Record<string, unknown>>) => boolean,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const result = await client.execute(sql, args);
      const rows = result.rows;

      if (predicate(rows)) {
        return rows;
      }
    } catch {
      // Retry while the background scan writes to SQLite.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for SQL condition: ${sql}`);
}

async function expectAcceptedTaskResponse(response: Response) {
  assert.deepStrictEqual(response["status"], 202);
  const raw: Record<string, unknown> = await response.json();
  assert.deepStrictEqual(raw["success"], true);
  const accepted = Schema.decodeUnknownSync(AsyncOperationAcceptedSchema)(raw["data"]);
  assert.deepStrictEqual(accepted.status, "queued");
  assert.deepStrictEqual(typeof accepted.task_id, "number");

  return accepted;
}

async function waitForTaskByPath(input: {
  readonly ctx: TestContext;
  readonly path: string;
  readonly sessionCookie: string;
  readonly timeoutMs?: number;
}) {
  const deadline = Date.now() + (input.timeoutMs ?? 5000);
  let lastStatus: string | undefined;

  while (Date.now() < deadline) {
    const response = await input.ctx.app.request(input.path, {
      headers: { Cookie: input.sessionCookie },
    });
    assert.deepStrictEqual(response["status"], 200);
    const raw = await response.json();
    const task = Schema.decodeUnknownSync(OperationTaskSchema)(raw);
    lastStatus = task.status;

    if (task.status === "succeeded") {
      return task;
    }

    if (task.status === "failed") {
      throw new Error(`Task ${task.id} failed: ${task.message ?? "unknown error"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for task ${input.path}, last status: ${lastStatus ?? "none"}`);
}

async function waitForSystemTask(input: {
  readonly ctx: TestContext;
  readonly sessionCookie: string;
  readonly taskId: number;
}) {
  return await waitForTaskByPath({
    ctx: input.ctx,
    path: `/api/system/tasks/${input.taskId}`,
    sessionCookie: input.sessionCookie,
  });
}

async function waitForAnimeScanTask(input: {
  readonly animeId: number;
  readonly ctx: TestContext;
  readonly sessionCookie: string;
  readonly taskId: number;
}) {
  return await waitForTaskByPath({
    ctx: input.ctx,
    path: `/api/anime/${input.animeId}/episodes/scan/tasks/${input.taskId}`,
    sessionCookie: input.sessionCookie,
  });
}

async function waitForLibraryImportTask(input: {
  readonly ctx: TestContext;
  readonly sessionCookie: string;
  readonly taskId: number;
}) {
  return await waitForTaskByPath({
    ctx: input.ctx,
    path: `/api/library/import/tasks/${input.taskId}`,
    sessionCookie: input.sessionCookie,
  });
}

async function readStreamChunk(reader: EventsReader, timeoutMs = 1000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error("Timed out waiting for stream chunk"));
        }, timeoutMs);
      }),
    ]);

    if (chunk.done) {
      throw new Error("Stream ended unexpectedly");
    }

    return new TextDecoder().decode(chunk["value"]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function readUntilMatch(reader: EventsReader, pattern: RegExp, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let output = "";

  while (Date.now() < deadline) {
    output += await readStreamChunk(reader, deadline - Date.now());

    if (pattern.test(output)) {
      return output;
    }
  }

  throw new Error(`Timed out waiting for stream output matching ${pattern}`);
}
