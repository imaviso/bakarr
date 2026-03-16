import { assert, assertEquals, assertMatch } from "@std/assert";
import { createClient } from "@libsql/client";
import { Effect, Layer, Redacted } from "effect";
import { AniListClient } from "./src/features/anime/anilist.ts";
import {
  type QBitTorrent,
  QBitTorrentClient,
} from "./src/features/operations/qbittorrent.ts";
import { mapQBitState } from "./src/features/operations/download-orchestration.ts";
import {
  type ParsedRelease,
  RssClient,
} from "./src/features/operations/rss-client.ts";
import {
  SeaDexClient,
  type SeaDexEntry,
} from "./src/features/operations/seadex-client.ts";
import type { AnimeSearchResult } from "../../packages/shared/src/index.ts";

const NARUTO_RELEASE_TITLE = "[SubsPlease] Naruto - 01 (1080p) [ABC123].mkv";

const integrationTestPermissions: Deno.PermissionOptions = {
  env: true,
  ffi: true,
  read: true,
  sys: true,
  write: true,
};

function integrationTest(
  name: string,
  fn: () => void | Promise<void>,
) {
  Deno.test({ fn, name, permissions: integrationTestPermissions });
}

integrationTest("GET /health returns ok", async () => {
  const ctx = await createTestContext();

  try {
    const response = await ctx.app.request("/health");

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { status: "ok" });
  } finally {
    await ctx.dispose();
  }
});

integrationTest(
  "search releases enriches SeaDex metadata using AniList ID",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const baseRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addResponse.status, 200);

        const response = await ctx.app.request(
          "/api/search/releases?query=Naruto&anime_id=20",
          { headers: { Cookie: sessionCookie } },
        );
        assertEquals(response.status, 200);

        const body = await response.json();
        assertEquals(body.seadex_groups, ["SubsPlease"]);
        assertEquals(body.results.length, 1);
        assertEquals(body.results[0].is_seadex, true);
        assertEquals(body.results[0].is_seadex_best, true);
        assertEquals(body.results[0].seadex_release_group, "SubsPlease");
        assertEquals(
          body.results[0].seadex_comparison,
          "https://releases.moe/compare/naruto",
        );
        assertEquals(
          body.results[0].seadex_notes,
          "Prefer the SeaDex best release when available.",
        );
        assertEquals(body.results[0].seadex_tags, ["Best", "Dual Audio"]);
        assertEquals(body.results[0].seadex_dual_audio, true);
      } finally {
        await Deno.remove(baseRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "search releases can match SeaDex by Nyaa URL when info hash is unavailable",
  async () => {
    const seadexLayer = Layer.succeed(SeaDexClient, {
      getEntryByAniListId: (_aniListId: number) =>
        Effect.succeed({
          alID: 20,
          comparison: "https://releases.moe/compare/naruto-url",
          incomplete: false,
          notes: "Matched by Nyaa URL fallback.",
          releases: [{
            dualAudio: false,
            groupedUrl: "https://releases.moe/collections/naruto-url",
            infoHash: undefined,
            isBest: false,
            releaseGroup: "OtherGroup",
            tags: ["Alt"],
            tracker: "Nyaa",
            url: "https://nyaa.si/download/7891011.torrent",
          }],
        }),
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
    const ctx = await createTestContext({ rssLayer, seadexLayer });

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const baseRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addResponse.status, 200);

        const response = await ctx.app.request(
          "/api/search/releases?query=Naruto&anime_id=20",
          { headers: { Cookie: sessionCookie } },
        );
        assertEquals(response.status, 200);

        const body = await response.json();
        assertEquals(body.results[0].is_seadex, true);
        assertEquals(body.results[0].is_seadex_best, false);
        assertEquals(
          body.results[0].seadex_comparison,
          "https://releases.moe/compare/naruto-url",
        );
        assertEquals(
          body.results[0].seadex_notes,
          "Matched by Nyaa URL fallback.",
        );
      } finally {
        await Deno.remove(baseRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "search releases only marks matching groups as SeaDex in fallback matching",
  async () => {
    const seadexLayer = Layer.succeed(SeaDexClient, {
      getEntryByAniListId: (_aniListId: number) =>
        Effect.succeed({
          alID: 20,
          comparison: "https://releases.moe/compare/yofukashi",
          incomplete: false,
          notes: "Okay-Subs is the recommended release.",
          releases: [{
            dualAudio: false,
            groupedUrl: "https://releases.moe/collections/yofukashi",
            infoHash: undefined,
            isBest: true,
            releaseGroup: "Okay-Subs",
            tags: ["Best"],
            tracker: "Nyaa",
            url: "https://nyaa.si/view/999999",
          }],
        }),
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
    const ctx = await createTestContext({ rssLayer, seadexLayer });

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const baseRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addResponse.status, 200);

        const response = await ctx.app.request(
          "/api/search/releases?query=Yofukashi%20no%20Uta&anime_id=20",
          { headers: { Cookie: sessionCookie } },
        );
        assertEquals(response.status, 200);

        const body = await response.json();
        assertEquals(body.results.length, 2);

        const okaySubs = body.results.find((result: { title: string }) =>
          result.title.includes("Okay-Subs")
        );
        const ember = body.results.find((result: { title: string }) =>
          result.title.includes("EMBER")
        );

        assertEquals(okaySubs?.is_seadex, true);
        assertEquals(okaySubs?.is_seadex_best, true);
        assertEquals(ember?.is_seadex, false);
        assertEquals(ember?.is_seadex_best, false);
      } finally {
        await Deno.remove(baseRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "episode search includes SeaDex metadata in ranked results",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const baseRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addResponse.status, 200);

        const response = await ctx.app.request(
          "/api/search/episode/20/1",
          { headers: { Cookie: sessionCookie } },
        );
        assertEquals(response.status, 200);

        const body = await response.json();
        assertEquals(body.length, 1);
        assertEquals(body[0].is_seadex, true);
        assertEquals(body[0].is_seadex_best, true);
        assertEquals(
          body[0].seadex_comparison,
          "https://releases.moe/compare/naruto",
        );
        assertEquals(body[0].seadex_dual_audio, true);
        assertEquals(
          body[0].seadex_notes,
          "Prefer the SeaDex best release when available.",
        );
        assertEquals(body[0].seadex_tags, ["Best", "Dual Audio"]);
        assertEquals(body[0].download_action.Accept?.is_seadex_best, true);
      } finally {
        await Deno.remove(baseRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "cached anime images are served from the image store",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const imagesPath = await Deno.makeTempDir();

      try {
        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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

        await Deno.mkdir(`${imagesPath}/anime/20`, { recursive: true });
        const body = new TextEncoder().encode("cached-image");
        await Deno.writeFile(`${imagesPath}/anime/20/cover.png`, body);

        const response = await ctx.app.request(
          "/api/images/anime/20/cover.png",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(response.status, 200);
        assertEquals(response.headers.get("content-type"), "image/png");
        assertEquals(await response.text(), "cached-image");
      } finally {
        await Deno.remove(imagesPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "bootstrap admin can log in and read auth/session protected endpoints",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      assertEquals(loginResponse.status, 200);

      const loginBody = await loginResponse.json();
      const sessionCookie = loginResponse.headers.get("set-cookie");

      assert(sessionCookie);
      assertEquals(loginBody.username, "admin");
      assertEquals(loginBody.must_change_password, true);
      assertMatch(loginBody.api_key, /^\*+$/);

      const meResponse = await ctx.app.request("/api/auth/me", {
        headers: { Cookie: sessionCookie },
      });

      assertEquals(meResponse.status, 200);

      const me = await meResponse.json();

      assertEquals(me.username, "admin");
      assert(typeof me.id === "number");

      const configResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });

      assertEquals(configResponse.status, 200);

      const config = await configResponse.json();

      assertEquals(config.general.database_path, ctx.databaseFile);
      assertEquals(config.profiles.length, 1);

      const statsResponse = await ctx.app.request("/api/library/stats", {
        headers: { Cookie: sessionCookie },
      });

      assertEquals(statsResponse.status, 200);
      assertEquals(await statsResponse.json(), {
        downloaded_episodes: 0,
        missing_episodes: 0,
        monitored_anime: 0,
        recent_downloads: 0,
        rss_feeds: 0,
        total_anime: 0,
        total_episodes: 0,
      });
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest("auth password change and logout flow works", async () => {
  const ctx = await createTestContext();

  try {
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

    assertEquals(changePasswordResponse.status, 200);

    const logoutResponse = await ctx.app.request("/api/auth/logout", {
      headers: { Cookie: sessionCookie },
      method: "POST",
    });

    assertEquals(logoutResponse.status, 200);

    const meAfterLogout = await ctx.app.request("/api/auth/me", {
      headers: { Cookie: sessionCookie },
    });

    assertEquals(meAfterLogout.status, 401);

    const reloginResponse = await ctx.app.request("/api/auth/login", {
      body: JSON.stringify({ password: "bakarr123", username: "admin" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    assertEquals(reloginResponse.status, 200);

    const reloginBody = await reloginResponse.json();
    assertEquals(reloginBody.must_change_password, false);
  } finally {
    await ctx.dispose();
  }
});

integrationTest(
  "system config update can repair corrupt stored config rows",
  async () => {
    const ctx = await createTestContext();

    try {
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
      assertEquals(configResponse.status, 200);
      const validConfig = await configResponse.json();

      const client = createClient({ url: `file:${ctx.databaseFile}` });

      try {
        await client.execute({
          sql: "update app_config set data = ? where id = 1",
          args: ["{"],
        });
        await client.execute({
          sql:
            "update quality_profiles set allowed_qualities = ? where name = ?",
          args: ["{", "Default"],
        });
      } finally {
        client.close();
      }

      const brokenConfigResponse = await ctx.app.request("/api/system/config", {
        headers: { Cookie: sessionCookie },
      });
      assertEquals(brokenConfigResponse.status, 500);

      const repairResponse = await ctx.app.request("/api/system/config", {
        body: JSON.stringify(validConfig),
        headers: {
          Cookie: sessionCookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      });
      assertEquals(repairResponse.status, 200);

      const repairedConfigResponse = await ctx.app.request(
        "/api/system/config",
        {
          headers: { Cookie: sessionCookie },
        },
      );
      assertEquals(repairedConfigResponse.status, 200);
      const repairedConfig = await repairedConfigResponse.json();
      assertEquals(repairedConfig.general.database_path, ctx.databaseFile);
      assertEquals(repairedConfig.profiles[0]?.name, "Default");
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "auth API key regeneration and API key login work",
  async () => {
    const ctx = await createTestContext();

    try {
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
      assertEquals(maskedKeyResponse.status, 200);
      const maskedKey = await maskedKeyResponse.json();
      assertMatch(maskedKey.api_key, /^\*+$/);

      const regenerateResponse = await ctx.app.request(
        "/api/auth/api-key/regenerate",
        {
          headers: { Cookie: sessionCookie },
          method: "POST",
        },
      );
      assertEquals(regenerateResponse.status, 200);
      const regenerated = await regenerateResponse.json();
      assertMatch(regenerated.api_key, /^[a-f0-9]{48}$/);

      const apiKeyLoginResponse = await ctx.app.request(
        "/api/auth/login/api-key",
        {
          body: JSON.stringify({ api_key: regenerated.api_key }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );

      assertEquals(apiKeyLoginResponse.status, 200);
      const apiKeyLoginBody = await apiKeyLoginResponse.json();
      assertEquals(apiKeyLoginBody.username, "admin");
      assertMatch(apiKeyLoginBody.api_key, /^\*+$/);

      const apiKeySessionCookie = apiKeyLoginResponse.headers.get("set-cookie");
      assert(apiKeySessionCookie);

      const meResponse = await ctx.app.request("/api/auth/me", {
        headers: { Cookie: apiKeySessionCookie },
      });

      assertEquals(meResponse.status, 200);
      const me = await meResponse.json();
      assertEquals(me.username, "admin");
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest("library browse returns sorted entries and sizes", async () => {
  const ctx = await createTestContext();

  try {
    const loginResponse = await ctx.app.request("/api/auth/login", {
      body: JSON.stringify({ password: "admin", username: "admin" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const sessionCookie = loginResponse.headers.get("set-cookie");
    assert(sessionCookie);

    const root = await Deno.makeTempDir();

    try {
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

      await Deno.mkdir(`${root}/anime`, { recursive: true });
      await Deno.writeTextFile(`${root}/notes.txt`, "hello");

      const browseResponse = await ctx.app.request(
        `/api/library/browse?path=${encodeURIComponent(root)}`,
        { headers: { Cookie: sessionCookie } },
      );

      assertEquals(browseResponse.status, 200);
      const browse = await browseResponse.json();

      assertEquals(browse.current_path, root);
      assertEquals(
        browse.parent_path,
        root.split("/").slice(0, -1).join("/") || "/",
      );
      assertEquals(browse.entries.length, 2);
      assertEquals(browse.entries[0].name, "anime");
      assertEquals(browse.entries[0].is_directory, true);
      assertEquals(browse.entries[1].name, "notes.txt");
      assertEquals(browse.entries[1].is_directory, false);
      assertEquals(browse.entries[1].size, 5);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  } finally {
    await ctx.dispose();
  }
});

integrationTest(
  "auth rejects invalid credentials and wrong password changes",
  async () => {
    const ctx = await createTestContext();

    try {
      const badLoginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "wrong", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      assertEquals(badLoginResponse.status, 401);
      assertEquals(
        await badLoginResponse.text(),
        "Invalid username or password",
      );

      const goodLoginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = goodLoginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const badApiKeyLogin = await ctx.app.request("/api/auth/login/api-key", {
        body: JSON.stringify({ api_key: "not-a-real-key" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      assertEquals(badApiKeyLogin.status, 401);
      assertEquals(await badApiKeyLogin.text(), "Invalid API key");

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

      assertEquals(badChangePassword.status, 401);
      assertEquals(
        await badChangePassword.text(),
        "Current password is incorrect",
      );
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest("quality and release profile CRUD works", async () => {
  const ctx = await createTestContext();

  try {
    const loginResponse = await ctx.app.request("/api/auth/login", {
      body: JSON.stringify({ password: "admin", username: "admin" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const sessionCookie = loginResponse.headers.get("set-cookie");
    assert(sessionCookie);

    const qualitiesResponse = await ctx.app.request("/api/profiles/qualities", {
      headers: { Cookie: sessionCookie },
    });
    assertEquals(qualitiesResponse.status, 200);
    const qualities = await qualitiesResponse.json();
    assertEquals(Array.isArray(qualities), true);
    assertEquals(qualities.length > 0, true);

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
    assertEquals(createProfileResponse.status, 200);

    const profilesAfterCreate = await ctx.app.request("/api/profiles", {
      headers: { Cookie: sessionCookie },
    });
    const createdProfiles = await profilesAfterCreate.json();
    assertEquals(
      createdProfiles.some((profile: { name: string }) =>
        profile.name === "Custom Test"
      ),
      true,
    );

    const updateProfileResponse = await ctx.app.request(
      "/api/profiles/Custom%20Test",
      {
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
      },
    );
    assertEquals(updateProfileResponse.status, 200);

    const profilesAfterUpdate = await ctx.app.request("/api/profiles", {
      headers: { Cookie: sessionCookie },
    });
    const updatedProfiles = await profilesAfterUpdate.json();
    const updatedProfile = updatedProfiles.find((profile: { name: string }) =>
      profile.name === "Custom Test"
    );
    assert(updatedProfile);
    assertEquals(updatedProfile.upgrade_allowed, false);
    assertEquals(updatedProfile.seadex_preferred, true);

    const createReleaseProfileResponse = await ctx.app.request(
      "/api/release-profiles",
      {
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
      },
    );
    assertEquals(createReleaseProfileResponse.status, 200);
    const createdReleaseProfile = await createReleaseProfileResponse.json();
    assertEquals(createdReleaseProfile.name, "Release Test");

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
    assertEquals(updateReleaseProfileResponse.status, 200);

    const releaseProfilesAfterUpdate = await ctx.app.request(
      "/api/release-profiles",
      {
        headers: { Cookie: sessionCookie },
      },
    );
    const releaseProfiles = await releaseProfilesAfterUpdate.json();
    const updatedReleaseProfile = releaseProfiles.find((
      profile: { id: number },
    ) => profile.id === createdReleaseProfile.id);
    assert(updatedReleaseProfile);
    assertEquals(updatedReleaseProfile.name, "Release Test Updated");
    assertEquals(updatedReleaseProfile.enabled, false);
    assertEquals(updatedReleaseProfile.is_global, true);

    const deleteReleaseProfileResponse = await ctx.app.request(
      `/api/release-profiles/${createdReleaseProfile.id}`,
      {
        headers: { Cookie: sessionCookie },
        method: "DELETE",
      },
    );
    assertEquals(deleteReleaseProfileResponse.status, 200);

    const deleteProfileResponse = await ctx.app.request(
      "/api/profiles/Custom%20Test",
      {
        headers: { Cookie: sessionCookie },
        method: "DELETE",
      },
    );
    assertEquals(deleteProfileResponse.status, 200);

    const finalProfiles = await ctx.app.request("/api/profiles", {
      headers: { Cookie: sessionCookie },
    });
    assertEquals(
      (await finalProfiles.json()).some((profile: { name: string }) =>
        profile.name === "Custom Test"
      ),
      false,
    );

    const finalReleaseProfiles = await ctx.app.request(
      "/api/release-profiles",
      {
        headers: { Cookie: sessionCookie },
      },
    );
    assertEquals(
      (await finalReleaseProfiles.json()).some((profile: { id: number }) =>
        profile.id === createdReleaseProfile.id
      ),
      false,
    );
  } finally {
    await ctx.dispose();
  }
});

integrationTest(
  "system library scan task maps files across anime roots",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const baseRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addResponse.status, 200);
        const anime = await addResponse.json();

        const filePath = `${anime.root_folder}/Naruto - 001.mkv`;
        await Deno.writeTextFile(filePath, "video");

        const scanTaskResponse = await ctx.app.request(
          "/api/system/tasks/scan",
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );
        assertEquals(scanTaskResponse.status, 200);

        const episodesResponse = await ctx.app.request(
          "/api/anime/20/episodes",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(episodesResponse.status, 200);
        const episodeRows = await episodesResponse.json();
        assertEquals(
          episodeRows.some((episode: {
            downloaded: boolean;
            number: number;
            file_path?: string;
          }) =>
            episode.number === 1 && episode.downloaded &&
            episode.file_path === filePath
          ),
          true,
        );
      } finally {
        await Deno.remove(baseRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "system health, log export, log clear, and image fallbacks work",
  async () => {
    const ctx = await createTestContext();

    try {
      const liveResponse = await ctx.app.request("/api/system/health/live");
      assertEquals(liveResponse.status, 200);
      assertEquals(await liveResponse.json(), { status: "alive" });

      const readyResponse = await ctx.app.request("/api/system/health/ready");
      assertEquals(readyResponse.status, 200);
      assertEquals(await readyResponse.json(), {
        checks: { database: true },
        ready: true,
      });

      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const logsBeforeClear = await ctx.app.request("/api/system/logs", {
        headers: { Cookie: sessionCookie },
      });
      assertEquals(logsBeforeClear.status, 200);
      const logsBody = await logsBeforeClear.json();
      assertEquals(logsBody.logs.length > 0, true);

      const exportJsonResponse = await ctx.app.request(
        "/api/system/logs/export?format=json",
        { headers: { Cookie: sessionCookie } },
      );
      assertEquals(exportJsonResponse.status, 200);
      assertEquals(
        exportJsonResponse.headers.get("content-type"),
        "application/json; charset=utf-8",
      );
      const exportedLogs = JSON.parse(await exportJsonResponse.text());
      assertEquals(Array.isArray(exportedLogs), true);
      assertEquals(exportedLogs.length > 0, true);

      const unauthorizedImageResponse = await ctx.app.request(
        "/api/images/anime/999/cover.png",
      );
      assertEquals(unauthorizedImageResponse.status, 401);

      const missingImageResponse = await ctx.app.request(
        "/api/images/anime/999/cover.png",
        { headers: { Cookie: sessionCookie } },
      );
      assertEquals(missingImageResponse.status, 404);

      const traversalImageResponse = await ctx.app.request(
        "/api/images/../secrets.txt",
        { headers: { Cookie: sessionCookie } },
      );
      assertEquals(traversalImageResponse.status, 404);

      const clearLogsResponse = await ctx.app.request("/api/system/logs", {
        headers: { Cookie: sessionCookie },
        method: "DELETE",
      });
      assertEquals(clearLogsResponse.status, 200);

      const logsAfterClear = await ctx.app.request("/api/system/logs", {
        headers: { Cookie: sessionCookie },
      });
      assertEquals(logsAfterClear.status, 200);
      assertEquals((await logsAfterClear.json()).logs.length, 0);
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "unmapped scan task updates job state for discovered folders",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        await Deno.mkdir(`${libraryPath}/Alpha Archive`, { recursive: true });
        await Deno.mkdir(`${libraryPath}/Beta Archive`, { recursive: true });

        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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

        const scanResponse = await ctx.app.request(
          "/api/library/unmapped/scan",
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );
        assertEquals(scanResponse.status, 200);

        const client = createClient({ url: `file:${ctx.databaseFile}` });

        try {
          await waitForSql(
            client,
            "select count(*) as value from unmapped_folder_matches where match_status = 'done'",
            [],
            (rows) => Number(rows[0]?.value ?? 0) >= 1,
          );

          const firstStateResponse = await ctx.app.request(
            "/api/library/unmapped",
            {
              headers: { Cookie: sessionCookie },
            },
          );
          assertEquals(firstStateResponse.status, 200);
          const firstState = await firstStateResponse.json();

          assertEquals(firstState.folders.length, 2);
          assertEquals(
            firstState.folders.filter((folder: { match_status?: string }) =>
              folder.match_status === "done"
            ).length,
            1,
          );
          assertEquals(
            firstState.folders.filter((folder: { match_status?: string }) =>
              folder.match_status === "pending"
            ).length,
            1,
          );
          assertEquals(firstState.has_outstanding_matches, true);
          assertEquals(firstState.is_scanning, false);

          const jobsResponse = await ctx.app.request("/api/system/jobs", {
            headers: { Cookie: sessionCookie },
          });
          assertEquals(jobsResponse.status, 200);
          const jobs = await jobsResponse.json();
          const unmappedJob = jobs.find((job: { name: string }) =>
            job.name === "unmapped_scan"
          );

          assert(unmappedJob);
          assertEquals(unmappedJob.last_status, "success");
          assertEquals(unmappedJob.schedule_value, "3s");

          const secondScanResponse = await ctx.app.request(
            "/api/library/unmapped/scan",
            {
              headers: { Cookie: sessionCookie },
              method: "POST",
            },
          );
          assertEquals(secondScanResponse.status, 200);

          await waitForSql(
            client,
            "select count(*) as value from unmapped_folder_matches where match_status = 'done'",
            [],
            (rows) => Number(rows[0]?.value ?? 0) === 2,
          );

          const secondStateResponse = await ctx.app.request(
            "/api/library/unmapped",
            {
              headers: { Cookie: sessionCookie },
            },
          );
          assertEquals(secondStateResponse.status, 200);
          const secondState = await secondStateResponse.json();

          assertEquals(secondState.folders.length, 2);
          assertEquals(
            secondState.folders.every((folder: { match_status?: string }) =>
              folder.match_status === "done"
            ),
            true,
          );
          assertEquals(secondState.has_outstanding_matches, false);
          assertEquals(secondState.is_scanning, false);
        } finally {
          client.close();
        }
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "unmapped folders mark already-imported anime suggestions",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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

        assertEquals(addResponse.status, 200);

        await Deno.mkdir(`${libraryPath}/Naruto Archive`, { recursive: true });

        const scanResponse = await ctx.app.request(
          "/api/library/unmapped/scan",
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );
        assertEquals(scanResponse.status, 200);

        const client = createClient({ url: `file:${ctx.databaseFile}` });

        try {
          await waitForSql(
            client,
            "select match_status from unmapped_folder_matches where path = ? limit 1",
            [`${libraryPath}/Naruto Archive`],
            (rows) => rows[0]?.match_status === "done",
          );
        } finally {
          client.close();
        }

        const unmappedResponse = await ctx.app.request(
          "/api/library/unmapped",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(unmappedResponse.status, 200);
        const state = await unmappedResponse.json();
        const folder = state.folders.find((entry: { name: string }) =>
          entry.name === "Naruto Archive"
        );

        assert(folder);
        assertEquals(state.has_outstanding_matches, false);
        assertEquals(folder.match_status, "done");
        assert(typeof folder.last_matched_at, "string");
        assertEquals(folder.suggested_matches.length > 0, true);
        assertEquals(folder.suggested_matches[0].id, 20);
        assertEquals(folder.suggested_matches[0].already_in_library, true);
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "concurrent unmapped scan requests coalesce into one run",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        await Deno.mkdir(`${libraryPath}/Naruto Archive`, { recursive: true });

        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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
          ctx.app.request(
            "/api/library/unmapped/scan",
            {
              headers: { Cookie: sessionCookie },
              method: "POST",
            },
          ),
          ctx.app.request(
            "/api/library/unmapped/scan",
            {
              headers: { Cookie: sessionCookie },
              method: "POST",
            },
          ),
        ]);

        assertEquals(firstScanResponse.status, 200);
        assertEquals(secondScanResponse.status, 200);

        const client = createClient({ url: `file:${ctx.databaseFile}` });

        try {
          const runCountRows = await waitForSql(
            client,
            "select run_count as value from background_jobs where name = 'unmapped_scan' limit 1",
            [],
            (rows) => Number(rows[0]?.value ?? 0) >= 1,
          );

          assertEquals(Number(runCountRows[0]?.value ?? 0), 1);

          await waitForSql(
            client,
            "select count(*) as value from unmapped_folder_matches where match_status = 'done'",
            [],
            (rows) => Number(rows[0]?.value ?? 0) === 1,
          );
        } finally {
          client.close();
        }
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "stale matching folders are retried on the next unmapped scan run",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        const folderPath = `${libraryPath}/Naruto Archive`;
        await Deno.mkdir(folderPath, { recursive: true });

        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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

          const scanResponse = await ctx.app.request(
            "/api/library/unmapped/scan",
            {
              headers: { Cookie: sessionCookie },
              method: "POST",
            },
          );
          assertEquals(scanResponse.status, 200);

          await waitForSql(
            client,
            "select match_status as value from unmapped_folder_matches where path = ? limit 1",
            [folderPath],
            (rows) => rows[0]?.value === "done",
          );
        } finally {
          client.close();
        }

        const unmappedResponse = await ctx.app.request(
          "/api/library/unmapped",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(unmappedResponse.status, 200);
        const state = await unmappedResponse.json();
        const folder = state.folders.find((entry: { name: string }) =>
          entry.name === "Naruto Archive"
        );

        assert(folder);
        assertEquals(state.has_outstanding_matches, false);
        assertEquals(folder.match_status, "done");
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "failed unmapped folders below the retry limit are retried on the next scan run",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        const folderPath = `${libraryPath}/Naruto Archive`;
        await Deno.mkdir(folderPath, { recursive: true });

        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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

          const scanResponse = await ctx.app.request(
            "/api/library/unmapped/scan",
            {
              headers: { Cookie: sessionCookie },
              method: "POST",
            },
          );
          assertEquals(scanResponse.status, 200);

          await waitForSql(
            client,
            "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
            [folderPath],
            (rows) =>
              rows[0]?.status === "done" &&
              Number(rows[0]?.attempts ?? 0) === 0,
          );
        } finally {
          client.close();
        }

        const unmappedResponse = await ctx.app.request(
          "/api/library/unmapped",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(unmappedResponse.status, 200);
        const state = await unmappedResponse.json();
        const folder = state.folders.find((entry: { name: string }) =>
          entry.name === "Naruto Archive"
        );

        assert(folder);
        assertEquals(state.has_outstanding_matches, false);
        assertEquals(folder.match_status, "done");
        assertEquals(folder.match_attempts, 0);
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "failed unmapped folders stop retrying after three attempts",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        const folderPath = `${libraryPath}/Naruto Archive`;
        await Deno.mkdir(folderPath, { recursive: true });

        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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

          const scanResponse = await ctx.app.request(
            "/api/library/unmapped/scan",
            {
              headers: { Cookie: sessionCookie },
              method: "POST",
            },
          );
          assertEquals(scanResponse.status, 200);

          const rows = await waitForSql(
            client,
            "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
            [folderPath],
            (values) => values.length === 1,
          );

          assertEquals(rows[0]?.status, "failed");
          assertEquals(Number(rows[0]?.attempts ?? 0), 3);
        } finally {
          client.close();
        }

        const unmappedResponse = await ctx.app.request(
          "/api/library/unmapped",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(unmappedResponse.status, 200);
        const state = await unmappedResponse.json();
        const folder = state.folders.find((entry: { name: string }) =>
          entry.name === "Naruto Archive"
        );

        assert(folder);
        assertEquals(state.has_outstanding_matches, false);
        assertEquals(folder.match_status, "failed");
        assertEquals(folder.match_attempts, 3);
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "unmapped folder controls pause resume reset and refresh matching",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        const folderPath = `${libraryPath}/Naruto Archive`;
        await Deno.mkdir(folderPath, { recursive: true });

        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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

          const pauseResponse = await ctx.app.request(
            "/api/library/unmapped/control",
            {
              body: JSON.stringify({ action: "pause", path: folderPath }),
              headers: {
                Cookie: sessionCookie,
                "Content-Type": "application/json",
              },
              method: "POST",
            },
          );
          assertEquals(pauseResponse.status, 200);

          let rows = await waitForSql(
            client,
            "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
            [folderPath],
            (values) => values[0]?.status === "paused",
          );
          assertEquals(Number(rows[0]?.attempts ?? 0), 2);

          const resumeResponse = await ctx.app.request(
            "/api/library/unmapped/control",
            {
              body: JSON.stringify({ action: "resume", path: folderPath }),
              headers: {
                Cookie: sessionCookie,
                "Content-Type": "application/json",
              },
              method: "POST",
            },
          );
          assertEquals(resumeResponse.status, 200);

          rows = await waitForSql(
            client,
            "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
            [folderPath],
            (values) => values[0]?.status === "pending",
          );
          assertEquals(Number(rows[0]?.attempts ?? 0), 2);

          const resetResponse = await ctx.app.request(
            "/api/library/unmapped/control",
            {
              body: JSON.stringify({ action: "reset", path: folderPath }),
              headers: {
                Cookie: sessionCookie,
                "Content-Type": "application/json",
              },
              method: "POST",
            },
          );
          assertEquals(resetResponse.status, 200);

          rows = await waitForSql(
            client,
            "select match_status as status, match_attempts as attempts, last_match_error as error, suggested_matches as suggestions from unmapped_folder_matches where path = ? limit 1",
            [folderPath],
            (values) =>
              values[0]?.status === "pending" &&
              Number(values[0]?.attempts ?? 0) === 0,
          );
          assertEquals(rows[0]?.error, null);
          assertEquals(rows[0]?.suggestions, "[]");

          const refreshResponse = await ctx.app.request(
            "/api/library/unmapped/control",
            {
              body: JSON.stringify({ action: "refresh", path: folderPath }),
              headers: {
                Cookie: sessionCookie,
                "Content-Type": "application/json",
              },
              method: "POST",
            },
          );
          assertEquals(refreshResponse.status, 200);

          rows = await waitForSql(
            client,
            "select match_status as status, match_attempts as attempts from unmapped_folder_matches where path = ? limit 1",
            [folderPath],
            (values) => values[0]?.status === "done",
          );
          assertEquals(Number(rows[0]?.attempts ?? 0), 0);
        } finally {
          client.close();
        }
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "bulk unmapped folder controls resume paused and retry failed folders",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        const pausedFolderPath = `${libraryPath}/Paused Archive`;
        const failedFolderPath = `${libraryPath}/Naruto Archive`;
        await Deno.mkdir(pausedFolderPath, { recursive: true });
        await Deno.mkdir(failedFolderPath, { recursive: true });

        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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
            [
              pausedFolderPath,
              "Paused Archive",
              new Date().toISOString(),
              new Date().toISOString(),
            ],
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

          const retryFailedResponse = await ctx.app.request(
            "/api/library/unmapped/control/bulk",
            {
              body: JSON.stringify({ action: "retry_failed" }),
              headers: {
                Cookie: sessionCookie,
                "Content-Type": "application/json",
              },
              method: "POST",
            },
          );
          assertEquals(retryFailedResponse.status, 200);

          let rows = await waitForSql(
            client,
            "select match_status as status, match_attempts as attempts, suggested_matches as suggestions from unmapped_folder_matches where path = ? limit 1",
            [failedFolderPath],
            (values) =>
              values[0]?.status === "pending" &&
              Number(values[0]?.attempts ?? 0) === 0,
          );
          assertEquals(rows[0]?.suggestions, "[]");

          const scanResponse = await ctx.app.request(
            "/api/library/unmapped/scan",
            {
              headers: { Cookie: sessionCookie },
              method: "POST",
            },
          );
          assertEquals(scanResponse.status, 200);

          rows = await waitForSql(
            client,
            "select match_status as status from unmapped_folder_matches where path = ? limit 1",
            [pausedFolderPath],
            (values) => values[0]?.status === "paused",
          );
          assertEquals(rows[0]?.status, "paused");

          const startPausedResponse = await ctx.app.request(
            "/api/library/unmapped/control/bulk",
            {
              body: JSON.stringify({ action: "resume_paused" }),
              headers: {
                Cookie: sessionCookie,
                "Content-Type": "application/json",
              },
              method: "POST",
            },
          );
          assertEquals(startPausedResponse.status, 200);

          rows = await waitForSql(
            client,
            "select match_status as status from unmapped_folder_matches where path = ? limit 1",
            [pausedFolderPath],
            (values) => values[0]?.status === "pending",
          );
          assertEquals(rows[0]?.status, "pending");
        } finally {
          client.close();
        }
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "bulk unmapped folder controls can pause queued and reset failed folders",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const libraryPath = await Deno.makeTempDir();

      try {
        const queuedFolderPath = `${libraryPath}/Queued Archive`;
        const failedFolderPath = `${libraryPath}/Failed Archive`;
        await Deno.mkdir(queuedFolderPath, { recursive: true });
        await Deno.mkdir(failedFolderPath, { recursive: true });

        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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
            [
              queuedFolderPath,
              "Queued Archive",
              new Date().toISOString(),
              new Date().toISOString(),
            ],
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

          const pauseQueuedResponse = await ctx.app.request(
            "/api/library/unmapped/control/bulk",
            {
              body: JSON.stringify({ action: "pause_queued" }),
              headers: {
                Cookie: sessionCookie,
                "Content-Type": "application/json",
              },
              method: "POST",
            },
          );
          assertEquals(pauseQueuedResponse.status, 200);

          let rows = await waitForSql(
            client,
            "select match_status as status from unmapped_folder_matches where path = ? limit 1",
            [queuedFolderPath],
            (values) => values[0]?.status === "paused",
          );
          assertEquals(rows[0]?.status, "paused");

          const resetFailedResponse = await ctx.app.request(
            "/api/library/unmapped/control/bulk",
            {
              body: JSON.stringify({ action: "reset_failed" }),
              headers: {
                Cookie: sessionCookie,
                "Content-Type": "application/json",
              },
              method: "POST",
            },
          );
          assertEquals(resetFailedResponse.status, 200);

          rows = await waitForSql(
            client,
            "select match_status as status, match_attempts as attempts, suggested_matches as suggestions, last_match_error as error from unmapped_folder_matches where path = ? limit 1",
            [failedFolderPath],
            (values) =>
              values[0]?.status === "pending" &&
              Number(values[0]?.attempts ?? 0) === 0,
          );
          assertEquals(rows[0]?.suggestions, "[]");
          assertEquals(rows[0]?.error, null);
        } finally {
          client.close();
        }
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "download reconcile imports a completed file into the anime library",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const animeRoot = await Deno.makeTempDir();
      const completedRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addAnimeResponse.status, 200);

        const magnetHash = "1234567890abcdef1234567890abcdef12345678";
        const triggerDownloadResponse = await ctx.app.request(
          "/api/search/download",
          {
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
          },
        );
        assertEquals(triggerDownloadResponse.status, 200);

        const completedFile = `${completedRoot}/Naruto - 01.mkv`;
        await Deno.writeTextFile(completedFile, "completed-download");

        const client = createClient({ url: `file:${ctx.databaseFile}` });
        try {
          await client.execute({
            sql:
              "update downloads set content_path = ?, save_path = ?, status = ?, external_state = ? where info_hash = ?",
            args: [
              completedFile,
              completedFile,
              "completed",
              "completed",
              magnetHash,
            ],
          });
        } finally {
          client.close();
        }

        const reconcileResponse = await ctx.app.request(
          "/api/downloads/1/reconcile",
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );
        assertEquals(reconcileResponse.status, 200);

        const episodesResponse = await ctx.app.request(
          "/api/anime/20/episodes",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(episodesResponse.status, 200);
        const episodes = await episodesResponse.json();
        assertEquals(episodes[0].downloaded, true);
        assertEquals(
          episodes[0].file_path?.startsWith(`${animeRoot}/Naruto/`),
          true,
        );

        const historyResponse = await ctx.app.request(
          "/api/downloads/history",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(historyResponse.status, 200);
        const history = await historyResponse.json();
        assertEquals(history[0].status, "imported");
      } finally {
        await Deno.remove(animeRoot, { recursive: true });
        await Deno.remove(completedRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "download sync auto-imports paused seeding torrents",
  async () => {
    const animeRoot = await Deno.makeTempDir();
    const completedRoot = await Deno.makeTempDir();
    const magnetHash = "1234567890abcdef1234567890abcdef12345678";
    const completedFile = `${completedRoot}/Naruto - 01.mkv`;
    await Deno.writeTextFile(completedFile, "completed-download");

    const qbitLayer = Layer.succeed(QBitTorrentClient, {
      addTorrentUrl: () => Effect.void,
      deleteTorrent: () => Effect.void,
      listTorrentContents: () =>
        Effect.succeed([{
          index: 0,
          is_seed: true,
          name: "Naruto - 01.mkv",
          priority: 1,
          progress: 1,
          size: 524_288_000,
        }]),
      listTorrents: () =>
        Effect.succeed(
          [{
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
          }] satisfies QBitTorrent[],
        ),
      pauseTorrent: () => Effect.void,
      resumeTorrent: () => Effect.void,
    });

    const ctx = await createTestContext({ qbitLayer });

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const currentConfigResponse = await ctx.app.request(
        "/api/system/config",
        { headers: { Cookie: sessionCookie } },
      );
      const currentConfig = await currentConfigResponse.json();

      const updatedConfigResponse = await ctx.app.request(
        "/api/system/config",
        {
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
        },
      );
      assertEquals(updatedConfigResponse.status, 200);

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
      assertEquals(addAnimeResponse.status, 200);

      const triggerDownloadResponse = await ctx.app.request(
        "/api/search/download",
        {
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
        },
      );
      assertEquals(triggerDownloadResponse.status, 200);

      const syncResponse = await ctx.app.request("/api/downloads/sync", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });
      assertEquals(syncResponse.status, 200);

      const verifyClient = createClient({ url: `file:${ctx.databaseFile}` });
      try {
        await waitForSql(
          verifyClient,
          "select status, reconciled_at as reconciledAt from downloads where info_hash = ?",
          [magnetHash],
          (rows) =>
            rows[0]?.status === "imported" &&
            typeof rows[0]?.reconciledAt === "string",
        );
      } finally {
        verifyClient.close();
      }

      const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
        headers: { Cookie: sessionCookie },
      });
      assertEquals(episodesResponse.status, 200);
      const episodes = await episodesResponse.json();
      assertEquals(episodes[0].downloaded, true);
      assertEquals(
        episodes[0].file_path?.startsWith(`${animeRoot}/Naruto/`),
        true,
      );
    } finally {
      await ctx.dispose();
      await Deno.remove(animeRoot, { recursive: true });
      await Deno.remove(completedRoot, { recursive: true });
    }
  },
);

integrationTest(
  "manual search download treats season-only batch torrents as batches",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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
        assertEquals(addAnimeResponse.status, 200);

        const triggerDownloadResponse = await ctx.app.request(
          "/api/search/download",
          {
            body: JSON.stringify({
              anime_id: 140960,
              magnet: "magnet:?xt=urn:btih:test-batch-season-pack",
              title:
                "[Flugel] Chainsaw Man S01 (BD 1080p HEVC Opus) [Multi Audio]",
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );
        assertEquals(triggerDownloadResponse.status, 200);

        const historyResponse = await ctx.app.request(
          "/api/downloads/history",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(historyResponse.status, 200);
        const history = await historyResponse.json();

        assertEquals(history.length, 1);
        assertEquals(history[0].is_batch, true);
        assertEquals(history[0].coverage_pending, true);
        assertEquals(history[0].covered_episodes, undefined);
        assertEquals(history[0].episode_number, 1);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "download sync refines season-pack coverage from qBittorrent file list",
  async () => {
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

    const ctx = await createTestContext({ qbitLayer });

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const currentConfigResponse = await ctx.app.request(
        "/api/system/config",
        { headers: { Cookie: sessionCookie } },
      );
      const currentConfig = await currentConfigResponse.json();

      const updatedConfigResponse = await ctx.app.request(
        "/api/system/config",
        {
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
        },
      );
      assertEquals(updatedConfigResponse.status, 200);

      const rootFolder = await Deno.makeTempDir();

      try {
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
        assertEquals(addAnimeResponse.status, 200);

        const triggerDownloadResponse = await ctx.app.request(
          "/api/search/download",
          {
            body: JSON.stringify({
              anime_id: 140960,
              magnet: `magnet:?xt=urn:btih:${magnetHash}`,
              title:
                "[Flugel] Chainsaw Man S01 (BD 1080p HEVC Opus) [Multi Audio]",
            }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );
        assertEquals(triggerDownloadResponse.status, 200);

        const syncResponse = await ctx.app.request("/api/downloads/sync", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });
        assertEquals(syncResponse.status, 200);

        const historyResponse = await ctx.app.request(
          "/api/downloads/history",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(historyResponse.status, 200);
        const history = await historyResponse.json();

        assertEquals(history.length, 1);
        assertEquals(history[0].covered_episodes, [1, 2]);
        assertEquals(history[0].episode_number, 1);
        assertEquals(history[0].is_batch, true);
        assertEquals(history[0].coverage_pending, undefined);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "qBittorrent state mapping treats completed seeding states as completed",
  () => {
    assertEquals(mapQBitState("pausedUP"), "completed");
    assertEquals(mapQBitState("queuedUP"), "completed");
    assertEquals(mapQBitState("stalledUP"), "completed");
    assertEquals(mapQBitState("checkingUP"), "completed");
    assertEquals(mapQBitState("forcedUP"), "completed");
    assertEquals(mapQBitState("pausedDL"), "paused");
  },
);

integrationTest(
  "download operation error branches return expected statuses",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const missingPause = await ctx.app.request("/api/downloads/999/pause", {
        headers: { Cookie: sessionCookie },
        method: "POST",
      });
      assertEquals(missingPause.status, 404);
      assertEquals(await missingPause.text(), "Download not found");

      const rootFolder = await Deno.makeTempDir();

      try {
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
        assertEquals(addAnimeResponse.status, 200);

        const triggerDownloadResponse = await ctx.app.request(
          "/api/search/download",
          {
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
          },
        );
        assertEquals(triggerDownloadResponse.status, 200);

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
        assertEquals(retryConflict.status, 409);
        assertEquals(
          await retryConflict.text(),
          "Download cannot be retried without a magnet link",
        );

        const reconcileConflict = await ctx.app.request(
          "/api/downloads/1/reconcile",
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );
        assertEquals(reconcileConflict.status, 409);
        assertEquals(
          await reconcileConflict.text(),
          "Download has no reconciliable content path",
        );
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "download pause resume and delete endpoints update queue state",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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
        assertEquals(addAnimeResponse.status, 200);

        const triggerDownloadResponse = await ctx.app.request(
          "/api/search/download",
          {
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
          },
        );
        assertEquals(triggerDownloadResponse.status, 200);

        const pauseResponse = await ctx.app.request("/api/downloads/1/pause", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });
        assertEquals(pauseResponse.status, 200);

        const queueAfterPause = await ctx.app.request("/api/downloads/queue", {
          headers: { Cookie: sessionCookie },
        });
        const pausedDownloads = await queueAfterPause.json();
        assertEquals(pausedDownloads[0].status, "paused");

        const resumeResponse = await ctx.app.request(
          "/api/downloads/1/resume",
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );
        assertEquals(resumeResponse.status, 200);

        const queueAfterResume = await ctx.app.request("/api/downloads/queue", {
          headers: { Cookie: sessionCookie },
        });
        const resumedDownloads = await queueAfterResume.json();
        assertEquals(resumedDownloads[0].status, "downloading");

        const deleteResponse = await ctx.app.request(
          "/api/downloads/1?delete_files=true",
          {
            headers: { Cookie: sessionCookie },
            method: "DELETE",
          },
        );
        assertEquals(deleteResponse.status, 200);

        const queueAfterDelete = await ctx.app.request("/api/downloads/queue", {
          headers: { Cookie: sessionCookie },
        });
        assertEquals((await queueAfterDelete.json()).length, 0);

        const historyAfterDelete = await ctx.app.request(
          "/api/downloads/history",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals((await historyAfterDelete.json()).length, 0);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "anime update, map, stream, and delete endpoints work",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const regenerateApiKey = await ctx.app.request(
        "/api/auth/api-key/regenerate",
        {
          headers: { Cookie: sessionCookie },
          method: "POST",
        },
      );
      assertEquals(regenerateApiKey.status, 200);
      const { api_key: apiKey } = await regenerateApiKey.json();

      const apiKeyLoginResponse = await ctx.app.request(
        "/api/auth/login/api-key",
        {
          body: JSON.stringify({ api_key: apiKey }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      assertEquals(apiKeyLoginResponse.status, 200);
      const apiKeySessionCookie = apiKeyLoginResponse.headers.get("set-cookie");
      assert(apiKeySessionCookie);

      const rootFolder = await Deno.makeTempDir();
      const updatedFolder = await Deno.makeTempDir();

      try {
        const releaseProfileResponse = await ctx.app.request(
          "/api/release-profiles",
          {
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
          },
        );
        assertEquals(releaseProfileResponse.status, 200);
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
        assertEquals(addResponse.status, 200);

        const monitorResponse = await ctx.app.request("/api/anime/20/monitor", {
          body: JSON.stringify({ monitored: false }),
          headers: {
            Cookie: apiKeySessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });
        assertEquals(monitorResponse.status, 200);

        const pathResponse = await ctx.app.request("/api/anime/20/path", {
          body: JSON.stringify({ path: updatedFolder }),
          headers: {
            Cookie: apiKeySessionCookie,
            "Content-Type": "application/json",
          },
          method: "PUT",
        });
        assertEquals(pathResponse.status, 200);

        const profileResponse = await ctx.app.request("/api/anime/20/profile", {
          body: JSON.stringify({ profile_name: "Default" }),
          headers: {
            Cookie: apiKeySessionCookie,
            "Content-Type": "application/json",
          },
          method: "PUT",
        });
        assertEquals(profileResponse.status, 200);

        const releaseProfilesResponse = await ctx.app.request(
          "/api/anime/20/release-profiles",
          {
            body: JSON.stringify({ release_profile_ids: [releaseProfile.id] }),
            headers: {
              Cookie: apiKeySessionCookie,
              "Content-Type": "application/json",
            },
            method: "PUT",
          },
        );
        assertEquals(releaseProfilesResponse.status, 200);

        const filePath = `${updatedFolder}/Naruto - 001.mkv`;
        await Deno.writeTextFile(filePath, "streamable");

        const mapResponse = await ctx.app.request(
          "/api/anime/20/episodes/1/map",
          {
            body: JSON.stringify({ file_path: filePath }),
            headers: {
              Cookie: apiKeySessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );
        assertEquals(mapResponse.status, 200);

        const detailResponse = await ctx.app.request("/api/anime/20", {
          headers: { Cookie: apiKeySessionCookie },
        });
        const detail = await detailResponse.json();
        assertEquals(detail.monitored, false);
        assertEquals(detail.root_folder, updatedFolder);
        assertEquals(detail.release_profile_ids, [releaseProfile.id]);

        const streamUnauthorized = await ctx.app.request("/api/stream/20/1");
        assertEquals(streamUnauthorized.status, 403);

        const streamUrlResponse = await ctx.app.request(
          "/api/anime/20/stream-url?episodeNumber=1",
          { headers: { Cookie: apiKeySessionCookie } },
        );
        assertEquals(streamUrlResponse.status, 200);
        const { url: signedStreamUrl } = await streamUrlResponse.json();

        const streamAuthorized = await ctx.app.request(signedStreamUrl, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        assertEquals(streamAuthorized.status, 200);
        assertEquals(
          streamAuthorized.headers.get("content-type"),
          "video/x-matroska",
        );
        assertEquals(await streamAuthorized.text(), "streamable");

        const deleteEpisodeFileResponse = await ctx.app.request(
          "/api/anime/20/episodes/1/file",
          {
            headers: { Cookie: apiKeySessionCookie },
            method: "DELETE",
          },
        );
        assertEquals(deleteEpisodeFileResponse.status, 200);

        const episodesAfterDelete = await ctx.app.request(
          "/api/anime/20/episodes",
          {
            headers: { Cookie: apiKeySessionCookie },
          },
        );
        const episodeRows = await episodesAfterDelete.json();
        assertEquals(episodeRows[0].downloaded, false);
        assertEquals(episodeRows[0].file_path, undefined);

        const deleteAnimeResponse = await ctx.app.request("/api/anime/20", {
          headers: { Cookie: apiKeySessionCookie },
          method: "DELETE",
        });
        assertEquals(deleteAnimeResponse.status, 200);

        const animeListAfterDelete = await ctx.app.request("/api/anime", {
          headers: { Cookie: apiKeySessionCookie },
        });
        assertEquals((await animeListAfterDelete.json()).length, 0);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
        await Deno.remove(updatedFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "stream endpoint rejects stale episode paths after anime root changes",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const initialRoot = await Deno.makeTempDir();
      const updatedRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addResponse.status, 200);
        const anime = await addResponse.json();

        const filePath = `${anime.root_folder}/Naruto - 001.mkv`;
        await Deno.writeTextFile(filePath, "stale-stream");

        const mapResponse = await ctx.app.request(
          "/api/anime/20/episodes/1/map",
          {
            body: JSON.stringify({ file_path: filePath }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );
        assertEquals(mapResponse.status, 200);

        const streamUrlResponse = await ctx.app.request(
          "/api/anime/20/stream-url?episodeNumber=1",
          { headers: { Cookie: sessionCookie } },
        );
        assertEquals(streamUrlResponse.status, 200);
        const { url: signedStreamUrl } = await streamUrlResponse.json();

        const initialStreamResponse = await ctx.app.request(signedStreamUrl);
        assertEquals(initialStreamResponse.status, 200);
        assertEquals(await initialStreamResponse.text(), "stale-stream");

        const pathResponse = await ctx.app.request("/api/anime/20/path", {
          body: JSON.stringify({ path: updatedRoot }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "PUT",
        });
        assertEquals(pathResponse.status, 200);

        const staleStreamResponse = await ctx.app.request(signedStreamUrl);
        assertEquals(staleStreamResponse.status, 404);
      } finally {
        await Deno.remove(initialRoot, { recursive: true });
        await Deno.remove(updatedRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "deleting an episode file removes the mapped file from disk",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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
        assertEquals(addResponse.status, 200);

        const anime = await addResponse.json();
        const filePath = `${anime.root_folder}/Naruto - 001.mkv`;
        await Deno.writeTextFile(filePath, "episode-bytes");

        const mapResponse = await ctx.app.request(
          "/api/anime/20/episodes/1/map",
          {
            body: JSON.stringify({ file_path: filePath }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );
        assertEquals(mapResponse.status, 200);

        const deleteResponse = await ctx.app.request(
          "/api/anime/20/episodes/1/file",
          {
            headers: { Cookie: sessionCookie },
            method: "DELETE",
          },
        );
        assertEquals(deleteResponse.status, 200);

        let removed = false;
        try {
          await Deno.stat(filePath);
        } catch {
          removed = true;
        }
        assertEquals(removed, true);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "anime search and AniList detail endpoints return fallback metadata",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const searchResponse = await ctx.app.request(
        "/api/anime/search?q=naruto",
        {
          headers: { Cookie: sessionCookie },
        },
      );
      assertEquals(searchResponse.status, 200);
      const searchResults = await searchResponse.json();
      assertEquals(searchResults.length > 0, true);
      assertEquals(
        searchResults.some((item: { id: number }) => item.id === 20),
        true,
      );

      const detailResponse = await ctx.app.request("/api/anime/anilist/20", {
        headers: { Cookie: sessionCookie },
      });
      assertEquals(detailResponse.status, 200);
      const detail = await detailResponse.json();
      assertEquals(detail.id, 20);
      assertEquals(detail.title.romaji, "Naruto");
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "RSS feed toggle and delete endpoints update feed state",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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
        assertEquals(addAnimeResponse.status, 200);

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
        assertEquals(addFeedResponse.status, 200);
        const feed = await addFeedResponse.json();
        assertEquals(feed.enabled, true);

        const toggleResponse = await ctx.app.request(
          `/api/rss/${feed.id}/toggle`,
          {
            body: JSON.stringify({ enabled: false }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "PUT",
          },
        );
        assertEquals(toggleResponse.status, 200);

        const animeFeedsAfterToggle = await ctx.app.request(
          "/api/anime/20/rss",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(animeFeedsAfterToggle.status, 200);
        const toggledFeeds = await animeFeedsAfterToggle.json();
        const toggledFeed = toggledFeeds.find((item: { id: number }) =>
          item.id === feed.id
        );
        assert(toggledFeed);
        assertEquals(toggledFeed.enabled, false);

        const deleteResponse = await ctx.app.request(`/api/rss/${feed.id}`, {
          headers: { Cookie: sessionCookie },
          method: "DELETE",
        });
        assertEquals(deleteResponse.status, 200);

        const animeFeedsAfterDelete = await ctx.app.request(
          "/api/anime/20/rss",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(
          (await animeFeedsAfterDelete.json()).some((item: { id: number }) =>
            item.id === feed.id
          ),
          false,
        );
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "validation errors return 400 for malformed or invalid requests",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const malformedJsonResponse = await ctx.app.request("/api/profiles", {
        body: "{bad-json",
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
        method: "POST",
      });
      assertEquals(malformedJsonResponse.status, 400);
      assertEquals(
        await malformedJsonResponse.text(),
        "Invalid JSON for create quality profile",
      );

      const invalidBodyResponse = await ctx.app.request("/api/profiles", {
        body: JSON.stringify({ name: "Incomplete" }),
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
        method: "POST",
      });
      assertEquals(invalidBodyResponse.status, 400);
      assertMatch(
        await invalidBodyResponse.text(),
        /^Invalid request body for create quality profile: .*: is missing(?:; .*: is missing)*$/,
      );

      const invalidQueryResponse = await ctx.app.request(
        "/api/system/logs?page=0",
        { headers: { Cookie: sessionCookie } },
      );
      assertEquals(invalidQueryResponse.status, 400);
      assertMatch(
        await invalidQueryResponse.text(),
        /^Invalid query parameters for system logs: page: Expected a positive number, actual 0; page: Expected undefined, actual "0"$/,
      );
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest("anime CRUD and episode scan flow works", async () => {
  const ctx = await createTestContext();

  try {
    const loginResponse = await ctx.app.request("/api/auth/login", {
      body: JSON.stringify({ password: "admin", username: "admin" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const sessionCookie = loginResponse.headers.get("set-cookie");
    assert(sessionCookie);

    const rootFolder = await Deno.makeTempDir();

    try {
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

      assertEquals(addResponse.status, 200);

      const anime = await addResponse.json();
      assertEquals(anime.id, 20);
      assertEquals(anime.title.romaji, "Naruto");
      assertEquals(anime.profile_name, "Default");
      assertEquals(anime.root_folder, `${rootFolder}/Naruto`);

      const listResponse = await ctx.app.request("/api/anime", {
        headers: { Cookie: sessionCookie },
      });

      assertEquals(listResponse.status, 200);
      const list = await listResponse.json();
      assertEquals(list.length, 1);

      const detailResponse = await ctx.app.request("/api/anime/20", {
        headers: { Cookie: sessionCookie },
      });

      assertEquals(detailResponse.status, 200);
      const detail = await detailResponse.json();
      assertEquals(detail.episode_count, 220);

      const episodesResponse = await ctx.app.request("/api/anime/20/episodes", {
        headers: { Cookie: sessionCookie },
      });

      assertEquals(episodesResponse.status, 200);
      const episodes = await episodesResponse.json();
      assertEquals(episodes.length, 220);
      assertEquals(episodes[0].number, 1);
      assertEquals(episodes[0].downloaded, false);

      await Deno.writeTextFile(
        `${anime.root_folder}/Naruto - 001.mkv`,
        "fake video data",
      );

      const scanResponse = await ctx.app.request(
        "/api/anime/20/episodes/scan",
        {
          headers: { Cookie: sessionCookie },
          method: "POST",
        },
      );

      assertEquals(scanResponse.status, 200);
      assertEquals(await scanResponse.json(), { found: 1, total: 1 });

      const filesResponse = await ctx.app.request("/api/anime/20/files", {
        headers: { Cookie: sessionCookie },
      });

      assertEquals(filesResponse.status, 200);
      const files = await filesResponse.json();
      assertEquals(files.length, 1);
      assertEquals(files[0].episode_number, 1);

      const episodesAfterScanResponse = await ctx.app.request(
        "/api/anime/20/episodes",
        {
          headers: { Cookie: sessionCookie },
        },
      );

      const episodesAfterScan = await episodesAfterScanResponse.json();
      assertEquals(episodesAfterScan[0].downloaded, true);

      const statsResponse = await ctx.app.request("/api/library/stats", {
        headers: { Cookie: sessionCookie },
      });

      assertEquals(await statsResponse.json(), {
        downloaded_episodes: 1,
        missing_episodes: 219,
        monitored_anime: 1,
        recent_downloads: 0,
        rss_feeds: 0,
        total_anime: 1,
        total_episodes: 220,
      });
    } finally {
      await Deno.remove(rootFolder, { recursive: true });
    }
  } finally {
    await ctx.dispose();
  }
});

integrationTest(
  "rss, wanted, rename, and download helper endpoints work",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();
      const importFolder = await Deno.makeTempDir();

      try {
        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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

        await Deno.writeTextFile(
          `${addedAnime.root_folder}/Hunter x Hunter (2011) - 001.mkv`,
          "episode file",
        );
        await ctx.app.request("/api/anime/11061/episodes/scan", {
          headers: { Cookie: sessionCookie },
          method: "POST",
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

        assertEquals(rssAdd.status, 200);

        const rssList = await ctx.app.request("/api/rss", {
          headers: { Cookie: sessionCookie },
        });

        const feeds = await rssList.json();
        assertEquals(feeds.length, 1);
        assertEquals(feeds[0].anime_id, 11061);

        const client = createClient({ url: `file:${ctx.databaseFile}` });
        try {
          await client.execute({
            sql:
              "update episodes set aired = ? where anime_id = ? and number = ?",
            args: ["2999-01-01T00:00:00.000Z", 11061, 2],
          });
          await client.execute({
            sql:
              "update episodes set aired = null where anime_id = ? and number = ?",
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
        assertEquals(missing[0].anime_id, 11061);
        assertEquals(
          missing.some((item: { episode_number: number }) =>
            item.episode_number === 2
          ),
          false,
        );
        assertEquals(
          missing.some((item: { episode_number: number }) =>
            item.episode_number === 3
          ),
          false,
        );

        const renamePreview = await ctx.app.request(
          "/api/anime/11061/rename-preview",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        const preview = await renamePreview.json();
        assertEquals(preview.length, 1);
        assertMatch(preview[0].new_filename, /Hunter x Hunter/);

        const renameExec = await ctx.app.request("/api/anime/11061/rename", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });

        assertEquals(renameExec.status, 200);
        assertEquals((await renameExec.json()).renamed, 1);

        await Deno.writeTextFile(
          `${importFolder}/import-me-002.mkv`,
          "video import",
        );

        const importScan = await ctx.app.request("/api/library/import/scan", {
          body: JSON.stringify({ anime_id: 11061, path: importFolder }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        const scanBody = await importScan.json();
        assertEquals(scanBody.files.length, 1);
        assertEquals(scanBody.files[0].episode_number, 2);

        const importExecute = await ctx.app.request("/api/library/import", {
          body: JSON.stringify({
            files: [{
              anime_id: 11061,
              episode_number: 2,
              source_path: `${importFolder}/import-me-002.mkv`,
            }],
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        const importBody = await importExecute.json();
        assertEquals(importBody.imported, 1);

        const releaseSearch = await ctx.app.request(
          "/api/search/releases?query=hunter",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        const releaseBody = await releaseSearch.json();
        assert(releaseBody.results.length >= 1);

        const episodeSearch = await ctx.app.request(
          "/api/search/episode/11061/2",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        const episodeSearchBody = await episodeSearch.json();
        assertEquals(episodeSearchBody.length, 1);

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

        assertEquals(triggerDownload.status, 200);

        const history = await ctx.app.request("/api/downloads/history", {
          headers: { Cookie: sessionCookie },
        });

        const historyBody = await history.json();
        assertEquals(historyBody.length, 1);

        const downloadId = historyBody[0].id;

        const pauseResponse = await ctx.app.request(
          `/api/downloads/${downloadId}/pause`,
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );

        assertEquals(pauseResponse.status, 200);

        const resumeResponse = await ctx.app.request(
          `/api/downloads/${downloadId}/resume`,
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );

        assertEquals(resumeResponse.status, 200);

        const retryResponse = await ctx.app.request(
          `/api/downloads/${downloadId}/retry`,
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );

        assertEquals(retryResponse.status, 200);

        const syncResponse = await ctx.app.request("/api/downloads/sync", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });

        assertEquals(syncResponse.status, 200);

        const reconcileResponse = await ctx.app.request(
          `/api/downloads/${downloadId}/reconcile`,
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );

        assertEquals(reconcileResponse.status, 409);

        const filteredLogs = await ctx.app.request(
          "/api/system/logs?event_type=downloads.triggered&level=success&page=1",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(filteredLogs.status, 200);
        const filteredLogsBody = await filteredLogs.json();
        assert(filteredLogsBody.logs.length >= 1);
        assertEquals(
          filteredLogsBody.logs.every((
            log: { event_type: string; level: string },
          ) =>
            log.event_type === "downloads.triggered" && log.level === "success"
          ),
          true,
        );

        const exportLogs = await ctx.app.request(
          "/api/system/logs/export?event_type=downloads.triggered&format=csv",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(exportLogs.status, 200);
        assertEquals(
          (await exportLogs.text()).includes("downloads.triggered"),
          true,
        );

        const jobsResponse = await ctx.app.request("/api/system/jobs", {
          headers: { Cookie: sessionCookie },
        });

        assertEquals(jobsResponse.status, 200);
        assertEquals(Array.isArray(await jobsResponse.json()), true);

        const eventsResponse = await ctx.app.request("/api/downloads/events", {
          headers: { Cookie: sessionCookie },
        });

        assertEquals(eventsResponse.status, 200);
        const events = await eventsResponse.json();
        assertEquals(events.length >= 1, true);

        const dashboardResponse = await ctx.app.request(
          "/api/system/dashboard",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(dashboardResponse.status, 200);
        const dashboard = await dashboardResponse.json();
        assertEquals(typeof dashboard.queued_downloads, "number");
        assertEquals(Array.isArray(dashboard.recent_download_events), true);

        const deleteResponse = await ctx.app.request(
          `/api/downloads/${downloadId}`,
          {
            headers: { Cookie: sessionCookie },
            method: "DELETE",
          },
        );

        assertEquals(deleteResponse.status, 200);

        const historyAfterDelete = await ctx.app.request(
          "/api/downloads/history",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals((await historyAfterDelete.json()).length, 0);

        const calendar = await ctx.app.request(
          `/api/calendar?start=${
            encodeURIComponent(new Date(0).toISOString())
          }&end=${
            encodeURIComponent(new Date(Date.now() + 86400000).toISOString())
          }`,
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(calendar.status, 200);
        assert((await calendar.json()).length >= 1);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
        await Deno.remove(importFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "rss task and missing-search task queue downloads",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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

        const rssXml =
          `<?xml version="1.0"?><rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel><item><title>[SubsPlease] Naruto - 001 (1080p)</title><link>https://nyaa.si/download/1.torrent</link><pubDate>${
            new Date().toUTCString()
          }</pubDate><nyaa:seeders>55</nyaa:seeders><nyaa:leechers>1</nyaa:leechers><nyaa:infoHash>abcdefabcdefabcdefabcdefabcdefabcdefabcd</nyaa:infoHash><nyaa:size>1.3 GiB</nyaa:size><nyaa:trusted>Yes</nyaa:trusted><nyaa:remake>No</nyaa:remake></item></channel></rss>`;
        const rssUrl = `data:text/xml,${encodeURIComponent(rssXml)}`;

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

        assertEquals(rssTask.status, 200);

        const statusAfterRss = await ctx.app.request("/api/system/status", {
          headers: { Cookie: sessionCookie },
        });

        const statusBody = await statusAfterRss.json();
        assertEquals(typeof statusBody.last_rss, "string");

        const queueAfterRss = await ctx.app.request("/api/downloads/queue", {
          headers: { Cookie: sessionCookie },
        });

        const queueRssBody = await queueAfterRss.json();
        assertEquals(queueRssBody.length, 1);

        const metricsResponse = await ctx.app.request("/api/metrics", {
          headers: { Cookie: sessionCookie },
        });

        assertEquals(metricsResponse.status, 200);
        const metricsText = await metricsResponse.text();
        assertEquals(metricsText.includes("bakarr_total_anime"), true);
        assertEquals(
          metricsText.includes("bakarr_active_download_items"),
          true,
        );
        assertEquals(
          metricsText.includes(
            'bakarr_background_worker_daemon_running{worker="download_sync"}',
          ),
          true,
        );
        assertEquals(
          metricsText.includes(
            'bakarr_http_requests_total{method="GET",route="/api/metrics",status="200"} 1',
          ),
          true,
        );
        assertEquals(
          metricsText.includes(
            'bakarr_http_request_duration_ms_bucket{method="GET",route="/api/metrics",status="200",le="10"}',
          ),
          true,
        );
        assertEquals(
          metricsText.includes(
            'bakarr_background_worker_runs_total{status="success",worker="download_sync"}',
          ),
          true,
        );

        const searchMissing = await ctx.app.request(
          "/api/downloads/search-missing",
          {
            body: JSON.stringify({ anime_id: 20 }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );

        assertEquals(searchMissing.status, 200);

        const history = await ctx.app.request("/api/downloads/history", {
          headers: { Cookie: sessionCookie },
        });

        const historyBody = await history.json();
        assert(historyBody.length >= 1);

        const scanTask = await ctx.app.request("/api/system/tasks/scan", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });

        assertEquals(scanTask.status, 200);

        const statusAfterScan = await ctx.app.request("/api/system/status", {
          headers: { Cookie: sessionCookie },
        });

        const scanStatusBody = await statusAfterScan.json();
        assertEquals(typeof scanStatusBody.last_scan, "string");

        const episodeSearch = await ctx.app.request(
          "/api/search/episode/20/1",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        const episodeSearchBody = await episodeSearch.json();
        assertEquals(episodeSearch.status, 200);
        assert(episodeSearchBody.length >= 1);
        assert(
          episodeSearchBody[0].download_action.Accept ||
            episodeSearchBody[0].download_action.Upgrade ||
            episodeSearchBody[0].download_action.Reject,
        );
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "missing-search ignores episodes that have not aired yet",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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
            sql:
              "update episodes set aired = ? where anime_id = ? and number = ?",
            args: ["2999-01-01T00:00:00.000Z", 20, 2],
          });
        } finally {
          client.close();
        }

        const rssXml =
          `<?xml version="1.0"?><rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel><item><title>[SubsPlease] Naruto - 002 (1080p)</title><link>https://nyaa.si/download/2.torrent</link><pubDate>${
            new Date().toUTCString()
          }</pubDate><nyaa:seeders>55</nyaa:seeders><nyaa:leechers>1</nyaa:leechers><nyaa:infoHash>bcdefabcdefabcdefabcdefabcdefabcdefabcde</nyaa:infoHash><nyaa:size>1.3 GiB</nyaa:size><nyaa:trusted>Yes</nyaa:trusted><nyaa:remake>No</nyaa:remake></item></channel></rss>`;
        const rssUrl = `data:text/xml,${encodeURIComponent(rssXml)}`;

        await ctx.app.request("/api/rss", {
          body: JSON.stringify({ anime_id: 20, url: rssUrl }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        const searchMissing = await ctx.app.request(
          "/api/downloads/search-missing",
          {
            body: JSON.stringify({ anime_id: 20 }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );

        assertEquals(searchMissing.status, 200);

        const history = await ctx.app.request("/api/downloads/history", {
          headers: { Cookie: sessionCookie },
        });

        assertEquals(history.status, 200);
        const downloads = await history.json();

        assertEquals(
          downloads.some((download: { episode_number: number }) =>
            download.episode_number === 2
          ),
          false,
        );
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "wanted and global missing search ignore unmonitored anime",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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

        assertEquals(addAnimeResponse.status, 200);

        const wantedResponse = await ctx.app.request(
          "/api/wanted/missing?limit=20",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(wantedResponse.status, 200);
        assertEquals(await wantedResponse.json(), []);

        const globalSearchResponse = await ctx.app.request(
          "/api/downloads/search-missing",
          {
            body: JSON.stringify({}),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );

        assertEquals(globalSearchResponse.status, 200);

        const historyResponse = await ctx.app.request(
          "/api/downloads/history",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(historyResponse.status, 200);
        assertEquals(await historyResponse.json(), []);

        const directSearchResponse = await ctx.app.request(
          "/api/downloads/search-missing",
          {
            body: JSON.stringify({ anime_id: 20 }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );

        assertEquals(directSearchResponse.status, 200);

        const directHistoryResponse = await ctx.app.request(
          "/api/downloads/history",
          {
            headers: { Cookie: sessionCookie },
          },
        );

        assertEquals(directHistoryResponse.status, 200);
        const downloads = await directHistoryResponse.json();
        assertEquals(downloads.length > 0, true);
        assertEquals(downloads[0].anime_id, 20);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "manual import succeeds for files outside configured roots",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();
      const importFolder = await Deno.makeTempDir();

      try {
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

        assertEquals(addAnimeResponse.status, 200);

        const sourcePath = `${importFolder}/manual-import-001.mkv`;
        await Deno.writeTextFile(sourcePath, "video import");

        const importScan = await ctx.app.request("/api/library/import/scan", {
          body: JSON.stringify({ anime_id: 20, path: importFolder }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        assertEquals(importScan.status, 200);
        const scanBody = await importScan.json();
        assertEquals(scanBody.files.length, 1);

        const importExecute = await ctx.app.request("/api/library/import", {
          body: JSON.stringify({
            files: [{
              anime_id: 20,
              episode_number: 1,
              source_path: sourcePath,
            }],
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        assertEquals(importExecute.status, 200);
        const importBody = await importExecute.json();
        assertEquals(importBody.imported, 1);
        assertEquals(importBody.failed, 0);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
        await Deno.remove(importFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "events endpoint streams initial state and live notifications",
  async () => {
    const ctx = await createTestContext();

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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

        assertEquals(addAnimeResponse.status, 200);

        const eventsResponse = await ctx.app.request("/api/events", {
          headers: { Cookie: sessionCookie },
        });

        assertEquals(eventsResponse.status, 200);
        assertEquals(
          eventsResponse.headers.get("content-type"),
          "text/event-stream",
        );
        assert(eventsResponse.body);

        reader = eventsResponse.body.getReader();

        const initialChunk = await readUntilMatch(
          reader,
          /"type":"DownloadProgress"/,
        );
        assertMatch(initialChunk, /: connected/);
        assertMatch(initialChunk, /"type":"DownloadProgress"/);
        assertMatch(initialChunk, /"downloads":\[\]/);

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

        assertEquals(triggerDownload.status, 200);

        const streamed = await readUntilMatch(
          reader,
          /"type":"DownloadStarted"|"type":"DownloadProgress"/,
        );

        assertMatch(
          streamed,
          /"type":"DownloadStarted"|"type":"DownloadProgress"/,
        );
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await reader?.cancel().catch(() => undefined);
      await ctx.dispose();
    }
  },
);

integrationTest(
  "events stream can reconnect after disconnect and still receive updates",
  async () => {
    const ctx = await createTestContext();

    let firstReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let secondReader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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

        assertEquals(addAnimeResponse.status, 200);

        const firstEventsResponse = await ctx.app.request("/api/events", {
          headers: { Cookie: sessionCookie },
        });
        assertEquals(firstEventsResponse.status, 200);
        assert(firstEventsResponse.body);
        firstReader = firstEventsResponse.body.getReader();
        await readUntilMatch(firstReader, /"type":"DownloadProgress"/);
        await firstReader.cancel().catch(() => undefined);
        firstReader = undefined;

        await new Promise((resolve) => setTimeout(resolve, 25));

        const secondEventsResponse = await ctx.app.request("/api/events", {
          headers: { Cookie: sessionCookie },
        });
        assertEquals(secondEventsResponse.status, 200);
        assert(secondEventsResponse.body);
        secondReader = secondEventsResponse.body.getReader();

        const secondInitial = await readUntilMatch(
          secondReader,
          /"type":"DownloadProgress"/,
        );
        assertMatch(secondInitial, /: connected/);

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

        assertEquals(triggerDownload.status, 200);

        const streamed = await readUntilMatch(
          secondReader,
          /"type":"DownloadStarted"|"type":"DownloadProgress"/,
        );

        assertMatch(
          streamed,
          /"type":"DownloadStarted"|"type":"DownloadProgress"/,
        );
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await firstReader?.cancel().catch(() => undefined);
      await secondReader?.cancel().catch(() => undefined);
      await ctx.dispose();
    }
  },
);

integrationTest(
  "events stream emits RSS and library scan progress updates",
  async () => {
    const ctx = await createTestContext();

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const rootFolder = await Deno.makeTempDir();

      try {
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

        assertEquals(addAnimeResponse.status, 200);

        await Deno.writeTextFile(`${rootFolder}/Naruto - 001.mkv`, "video");

        const rssXml =
          `<?xml version="1.0"?><rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel><item><title>[SubsPlease] Naruto - 001 (1080p)</title><link>https://nyaa.si/download/1.torrent</link><pubDate>${
            new Date().toUTCString()
          }</pubDate><nyaa:seeders>55</nyaa:seeders><nyaa:leechers>1</nyaa:leechers><nyaa:infoHash>abcdefabcdefabcdefabcdefabcdefabcdefabcd</nyaa:infoHash><nyaa:size>1.3 GiB</nyaa:size><nyaa:trusted>Yes</nyaa:trusted><nyaa:remake>No</nyaa:remake></item></channel></rss>`;
        const rssUrl = `data:text/xml,${encodeURIComponent(rssXml)}`;

        const addFeedResponse = await ctx.app.request("/api/rss", {
          body: JSON.stringify({ anime_id: 20, url: rssUrl }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        assertEquals(addFeedResponse.status, 200);

        const eventsResponse = await ctx.app.request("/api/events", {
          headers: { Cookie: sessionCookie },
        });

        assertEquals(eventsResponse.status, 200);
        assert(eventsResponse.body);
        reader = eventsResponse.body.getReader();

        await readUntilMatch(reader, /"type":"DownloadProgress"/);

        const rssTask = await ctx.app.request("/api/system/tasks/rss", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });

        assertEquals(rssTask.status, 200);

        const rssProgress = await readUntilMatch(
          reader,
          /"type":"RssCheckProgress"/,
        );
        assertMatch(rssProgress, /"type":"RssCheckProgress"/);

        const scanTask = await ctx.app.request("/api/system/tasks/scan", {
          headers: { Cookie: sessionCookie },
          method: "POST",
        });

        assertEquals(scanTask.status, 200);

        const scanProgress = await readUntilMatch(
          reader,
          /"type":"LibraryScanProgress"/,
        );
        assertMatch(scanProgress, /"type":"LibraryScanProgress"/);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await reader?.cancel().catch(() => undefined);
      await ctx.dispose();
    }
  },
);

integrationTest(
  "batch reconcile imports multiple completed episodes into the anime library",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const animeRoot = await Deno.makeTempDir();
      const completedRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addAnimeResponse.status, 200);

        const magnetHash = "abcdef1234567890abcdef1234567890abcdef12";
        const triggerDownloadResponse = await ctx.app.request(
          "/api/search/download",
          {
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
          },
        );
        assertEquals(triggerDownloadResponse.status, 200);

        const batchFolder = `${completedRoot}/batch`;
        await Deno.mkdir(batchFolder, { recursive: true });
        await Deno.writeTextFile(
          `${batchFolder}/Naruto - 001.mkv`,
          "episode-1",
        );
        await Deno.writeTextFile(
          `${batchFolder}/Naruto - 002.mkv`,
          "episode-2",
        );

        const client = createClient({ url: `file:${ctx.databaseFile}` });
        try {
          await client.execute({
            sql:
              "update downloads set content_path = ?, save_path = ?, status = ?, external_state = ?, is_batch = 1 where info_hash = ?",
            args: [
              batchFolder,
              batchFolder,
              "completed",
              "completed",
              magnetHash,
            ],
          });
        } finally {
          client.close();
        }

        const reconcileResponse = await ctx.app.request(
          "/api/downloads/1/reconcile",
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );
        assertEquals(reconcileResponse.status, 200);

        const episodesResponse = await ctx.app.request(
          "/api/anime/20/episodes",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(episodesResponse.status, 200);
        const episodes = await episodesResponse.json();
        assertEquals(episodes[0].downloaded, true);
        assertEquals(episodes[1].downloaded, true);
        assertEquals(
          episodes[0].file_path?.includes(`${animeRoot}/Naruto/`),
          true,
        );
        assertEquals(
          episodes[1].file_path?.includes(`${animeRoot}/Naruto/`),
          true,
        );

        const historyResponse = await ctx.app.request(
          "/api/downloads/history",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        assertEquals(historyResponse.status, 200);
        const history = await historyResponse.json();
        assertEquals(history[0].status, "imported");
        assertEquals(history[0].is_batch, true);
      } finally {
        await Deno.remove(animeRoot, { recursive: true });
        await Deno.remove(completedRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "batch reconcile marks already-imported episodes as reconciled",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);

      const animeRoot = await Deno.makeTempDir();
      const completedRoot = await Deno.makeTempDir();

      try {
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
        assertEquals(addAnimeResponse.status, 200);
        const anime = await addAnimeResponse.json();

        const existingEpisodeOne = `${anime.root_folder}/Naruto - 001.mkv`;
        const existingEpisodeTwo = `${anime.root_folder}/Naruto - 002.mkv`;
        await Deno.writeTextFile(existingEpisodeOne, "episode-1");
        await Deno.writeTextFile(existingEpisodeTwo, "episode-2");

        const mapEpisodeOne = await ctx.app.request(
          "/api/anime/20/episodes/1/map",
          {
            body: JSON.stringify({ file_path: existingEpisodeOne }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );
        assertEquals(mapEpisodeOne.status, 200);

        const mapEpisodeTwo = await ctx.app.request(
          "/api/anime/20/episodes/2/map",
          {
            body: JSON.stringify({ file_path: existingEpisodeTwo }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );
        assertEquals(mapEpisodeTwo.status, 200);

        const magnetHash = "abcdef1234567890abcdef1234567890abcdef12";
        const triggerDownloadResponse = await ctx.app.request(
          "/api/search/download",
          {
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
          },
        );
        assertEquals(triggerDownloadResponse.status, 200);

        const batchFolder = `${completedRoot}/batch`;
        await Deno.mkdir(batchFolder, { recursive: true });
        await Deno.writeTextFile(
          `${batchFolder}/Naruto - 001.mkv`,
          "episode-1",
        );
        await Deno.writeTextFile(
          `${batchFolder}/Naruto - 002.mkv`,
          "episode-2",
        );

        const client = createClient({ url: `file:${ctx.databaseFile}` });
        try {
          await client.execute({
            sql:
              "update downloads set content_path = ?, save_path = ?, status = ?, external_state = ?, is_batch = 1 where info_hash = ?",
            args: [
              batchFolder,
              batchFolder,
              "completed",
              "completed",
              magnetHash,
            ],
          });
        } finally {
          client.close();
        }

        const reconcileResponse = await ctx.app.request(
          "/api/downloads/1/reconcile",
          {
            headers: { Cookie: sessionCookie },
            method: "POST",
          },
        );
        assertEquals(reconcileResponse.status, 200);

        const verifyClient = createClient({ url: `file:${ctx.databaseFile}` });
        try {
          const result = await verifyClient.execute(
            "select status, reconciled_at as reconciledAt from downloads where id = 1",
          );
          const row = result.rows[0] as {
            reconciledAt?: string | null;
            status?: string;
          };
          assertEquals(row.status, "imported");
          assertEquals(typeof row.reconciledAt, "string");
        } finally {
          verifyClient.close();
        }
      } finally {
        await Deno.remove(animeRoot, { recursive: true });
        await Deno.remove(completedRoot, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "add anime without root folder falls back to configured library path",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);
      const libraryPath = await Deno.makeTempDir();

      try {
        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          {
            headers: { Cookie: sessionCookie },
          },
        );
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

        assertEquals(addResponse.status, 200);
        const anime = await addResponse.json();
        assertEquals(anime.root_folder.startsWith(libraryPath), true);
        assertEquals(anime.root_folder, `${libraryPath}/Naruto`);
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "importing an unmapped folder maps the anime to that library folder",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);
      const libraryPath = await Deno.makeTempDir();

      try {
        const currentConfigResponse = await ctx.app.request(
          "/api/system/config",
          { headers: { Cookie: sessionCookie } },
        );
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
        await Deno.mkdir(folderPath, { recursive: true });
        await Deno.writeTextFile(
          `${folderPath}/[SubsPlease] Naruto - 001.mkv`,
          "test",
        );

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

        assertEquals(addResponse.status, 200);

        const beforeImport = await ctx.app.request("/api/library/unmapped", {
          headers: { Cookie: sessionCookie },
        });
        assertEquals(beforeImport.status, 200);
        const beforeState = await beforeImport.json();
        assertEquals(beforeState.folders.length, 1);
        assertEquals(beforeState.folders[0].name, folderName);

        const importResponse = await ctx.app.request(
          "/api/library/unmapped/import",
          {
            body: JSON.stringify({ anime_id: 20, folder_name: folderName }),
            headers: {
              Cookie: sessionCookie,
              "Content-Type": "application/json",
            },
            method: "POST",
          },
        );

        assertEquals(importResponse.status, 200);

        const animeResponse = await ctx.app.request("/api/anime/20", {
          headers: { Cookie: sessionCookie },
        });
        const anime = await animeResponse.json();
        assertEquals(anime.root_folder, folderPath);

        const episodesResponse = await ctx.app.request(
          "/api/anime/20/episodes",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        const episodeRows = await episodesResponse.json();
        assertEquals(
          episodeRows.some((
            episode: {
              downloaded: boolean;
              number: number;
              file_path?: string;
            },
          ) =>
            episode.number === 1 && episode.downloaded &&
            episode.file_path?.includes(folderName)
          ),
          true,
        );

        const afterImport = await ctx.app.request("/api/library/unmapped", {
          headers: { Cookie: sessionCookie },
        });
        assertEquals(afterImport.status, 200);
        const afterState = await afterImport.json();
        assertEquals(afterState.folders.length, 0);
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "adding an anime can keep an existing folder as its root",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);
      const libraryPath = await Deno.makeTempDir();

      try {
        const existingFolder = `${libraryPath}/Naruto Fansub`;
        await Deno.mkdir(existingFolder, { recursive: true });

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

        assertEquals(addResponse.status, 200);
        const anime = await addResponse.json();
        assertEquals(anime.root_folder, existingFolder);
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "adding an anime with an already-mapped existing root returns conflict",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);
      const libraryPath = await Deno.makeTempDir();

      try {
        const existingFolder = `${libraryPath}/Naruto Fansub`;
        await Deno.mkdir(existingFolder, { recursive: true });

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

        assertEquals(firstAddResponse.status, 200);

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

        assertEquals(secondAddResponse.status, 409);
      } finally {
        await Deno.remove(libraryPath, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "add anime with explicit root folder creates anime-specific folder by default",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);
      const rootFolder = await Deno.makeTempDir();

      try {
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

        assertEquals(addResponse.status, 200);
        const anime = await addResponse.json();
        assertEquals(anime.root_folder, `${rootFolder}/Hunter x Hunter (2011)`);

        const stats = await Deno.stat(anime.root_folder);
        assertEquals(stats.isDirectory, true);
      } finally {
        await Deno.remove(rootFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest(
  "import scan matches local anime by parsed filename",
  async () => {
    const ctx = await createTestContext();

    try {
      const loginResponse = await ctx.app.request("/api/auth/login", {
        body: JSON.stringify({ password: "admin", username: "admin" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const sessionCookie = loginResponse.headers.get("set-cookie");
      assert(sessionCookie);
      const narutoFolder = await Deno.makeTempDir();
      const hxhFolder = await Deno.makeTempDir();
      const importFolder = await Deno.makeTempDir();

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
            root_folder: `${hxhFolder}-spy`,
          }),
          headers: {
            Cookie: sessionCookie,
            "Content-Type": "application/json",
          },
          method: "POST",
        });

        await Deno.writeTextFile(
          `${importFolder}/[SubsPlease] Hunter x Hunter (2011) - 002 [1080p].mkv`,
          "video",
        );
        await Deno.writeTextFile(
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

        assertEquals(scanResponse.status, 200);
        const scanBody = await scanResponse.json();
        assertEquals(scanBody.files.length, 2);
        assertEquals(scanBody.files[0].matched_anime?.id, 11061);
        assertEquals(scanBody.files[0].suggested_candidate_id, 11061);
        assertEquals(scanBody.files[1].suggested_candidate_id, 140960);
      } finally {
        await Deno.remove(narutoFolder, { recursive: true });
        await Deno.remove(hxhFolder, { recursive: true });
        await Deno.remove(`${hxhFolder}-spy`, { recursive: true }).catch(() =>
          undefined
        );
        await Deno.remove(importFolder, { recursive: true });
      }
    } finally {
      await ctx.dispose();
    }
  },
);

integrationTest("bulk map accepts empty file path as unmap", async () => {
  const ctx = await createTestContext();

  try {
    const loginResponse = await ctx.app.request("/api/auth/login", {
      body: JSON.stringify({ password: "admin", username: "admin" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const sessionCookie = loginResponse.headers.get("set-cookie");
    assert(sessionCookie);
    const rootFolder = await Deno.makeTempDir();

    try {
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
      await Deno.writeTextFile(filePath, "video");

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
      assertEquals(episodes[0].downloaded, false);
      assertEquals(episodes[0].file_path, undefined);
    } finally {
      await Deno.remove(rootFolder, { recursive: true });
    }
  } finally {
    await ctx.dispose();
  }
});

const TEST_ANIME_METADATA = new Map([
  [20, {
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
  }],
  [11061, {
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
  }],
  [140960, {
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
  }],
]);

function normalizeForSearch(s: string): string {
  return s.toLowerCase()
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
      const normalizedEnglish = meta.title.english
        ? normalizeForSearch(meta.title.english)
        : "";
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
          status: meta.status,
          title: meta.title,
        });
      }
    }
    return Effect.succeed(results);
  },
  getAnimeMetadataById: (id: number) =>
    Effect.succeed(TEST_ANIME_METADATA.get(id) ?? null),
});

function deterministicHex(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(40, "0");
}

function makeTestRelease(
  title: string,
  overrides: Partial<ParsedRelease> = {},
): ParsedRelease {
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
  [20, {
    alID: 20,
    comparison: "https://releases.moe/compare/naruto",
    incomplete: false,
    notes: "Prefer the SeaDex best release when available.",
    releases: [{
      dualAudio: true,
      groupedUrl: "https://releases.moe/collection/naruto",
      infoHash: deterministicHex(NARUTO_RELEASE_TITLE),
      isBest: true,
      releaseGroup: "SubsPlease",
      tags: ["Best", "Dual Audio"],
      tracker: "Nyaa",
      url: "https://nyaa.si/view/123",
    }],
  }],
]);

const testRssLayer = Layer.succeed(RssClient, {
  fetchItems: (url: string) => {
    const query = decodeURIComponent(url).toLowerCase();
    const releases: ParsedRelease[] = [];
    if (query.includes("naruto")) {
      releases.push(
        makeTestRelease(NARUTO_RELEASE_TITLE),
      );
    }
    if (query.includes("hunter")) {
      releases.push(
        makeTestRelease(
          "[SubsPlease] Hunter x Hunter (2011) - 02 (1080p) [DEF456].mkv",
        ),
      );
    }
    return Effect.succeed(releases);
  },
});

const testSeaDexLayer = Layer.succeed(SeaDexClient, {
  getEntryByAniListId: (aniListId: number) =>
    Effect.succeed(TEST_SEADEX_ENTRIES.get(aniListId) ?? null),
});

async function createTestContext(options?: {
  qbitLayer?: Layer.Layer<QBitTorrentClient>;
  rssLayer?: Layer.Layer<RssClient>;
  seadexLayer?: Layer.Layer<SeaDexClient>;
}) {
  const { bootstrap } = await import("./main.ts");
  const databaseFile = await Deno.makeTempFile({ suffix: ".sqlite" });
  const { app, runtime } = await bootstrap(
    {
      bootstrapPassword: Redacted.make("admin"),
      bootstrapUsername: "admin",
      databaseFile,
      port: 9999,
    },
    {
      aniListLayer: testAniListLayer,
      qbitLayer: options?.qbitLayer,
      rssLayer: options?.rssLayer ?? testRssLayer,
      seadexLayer: options?.seadexLayer ?? testSeaDexLayer,
    },
  );

  return {
    app,
    databaseFile,
    dispose: async () => {
      await runtime.dispose();
      await Deno.remove(databaseFile);
    },
  };
}

async function waitForSql(
  client: ReturnType<typeof createClient>,
  sql: string,
  args: Parameters<typeof client.execute>[1],
  predicate: (rows: Array<Record<string, unknown>>) => boolean,
  timeoutMs = 5000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const result = await client.execute(sql, args);
      const rows = result.rows as Array<Record<string, unknown>>;

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

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 1000,
) {
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

    return new TextDecoder().decode(chunk.value);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function readUntilMatch(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pattern: RegExp,
  timeoutMs = 3000,
) {
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
