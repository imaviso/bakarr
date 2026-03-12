import { assert, assertEquals, assertMatch } from "@std/assert";
import { Redacted } from "effect";

import { bootstrap } from "./main.ts";

Deno.test("GET /health returns ok", async () => {
  const ctx = await createTestContext();

  try {
    const response = await ctx.app.request("/health");

    assertEquals(response.status, 200);
    assertEquals(await response.json(), { status: "ok" });
  } finally {
    await ctx.dispose();
  }
});

Deno.test("bootstrap admin can log in and read auth/session protected endpoints", async () => {
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
    assertMatch(loginBody.api_key, /^[a-f0-9]{48}$/);

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
      recent_downloads: 0,
      rss_feeds: 0,
      total_anime: 0,
      total_episodes: 0,
    });
  } finally {
    await ctx.dispose();
  }
});

Deno.test("auth password change and logout flow works", async () => {
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

Deno.test("anime CRUD and episode scan flow works", async () => {
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

Deno.test("rss, wanted, rename, and download helper endpoints work", async () => {
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
          id: 11061,
          monitor_and_search: false,
          monitored: true,
          profile_name: "Default",
          release_profile_ids: [],
          root_folder: rootFolder,
        }),
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
        method: "POST",
      });

      assertEquals(rssAdd.status, 200);

      const rssList = await ctx.app.request("/api/rss", {
        headers: { Cookie: sessionCookie },
      });

      const feeds = await rssList.json();
      assertEquals(feeds.length, 1);
      assertEquals(feeds[0].anime_id, 11061);

      const wanted = await ctx.app.request("/api/wanted/missing?limit=5", {
        headers: { Cookie: sessionCookie },
      });

      const missing = await wanted.json();
      assertEquals(missing.length, 5);
      assertEquals(missing[0].anime_id, 11061);

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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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

      const dashboardResponse = await ctx.app.request("/api/system/dashboard", {
        headers: { Cookie: sessionCookie },
      });

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
});

Deno.test("rss task and missing-search task queue downloads", async () => {
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

      const rssXml =
        `<?xml version="1.0"?><rss version="2.0" xmlns:nyaa="https://nyaa.si/xmlns/nyaa"><channel><item><title>[SubsPlease] Naruto - 001 (1080p)</title><link>https://nyaa.si/download/1.torrent</link><pubDate>${
          new Date().toUTCString()
        }</pubDate><nyaa:seeders>55</nyaa:seeders><nyaa:leechers>1</nyaa:leechers><nyaa:infoHash>abcdefabcdefabcdefabcdefabcdefabcdefabcd</nyaa:infoHash><nyaa:size>1.3 GiB</nyaa:size><nyaa:trusted>Yes</nyaa:trusted><nyaa:remake>No</nyaa:remake></item></channel></rss>`;
      const rssUrl = `data:text/xml,${encodeURIComponent(rssXml)}`;

      await ctx.app.request("/api/rss", {
        body: JSON.stringify({ anime_id: 20, url: rssUrl }),
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
      assertEquals(metricsText.includes("bakarr_active_download_items"), true);

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

      const episodeSearch = await ctx.app.request("/api/search/episode/20/1", {
        headers: { Cookie: sessionCookie },
      });

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
});

Deno.test("add anime without root folder falls back to configured library path", async () => {
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
});

Deno.test("add anime with explicit root folder creates anime-specific folder by default", async () => {
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
});

Deno.test("import scan matches local anime by parsed filename", async () => {
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
        method: "POST",
      });

      await Deno.writeTextFile(
        `${importFolder}/[SubsPlease] Hunter x Hunter (2011) - 002 [1080p].mkv`,
        "video",
      );
      await Deno.writeTextFile(
        `${importFolder}/[SubsPlease] SPYxFAMILY Season II - 03 [1080p].mkv`,
        "video",
      );

      const scanResponse = await ctx.app.request("/api/library/import/scan", {
        body: JSON.stringify({ path: importFolder }),
        headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
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
});

Deno.test("bulk map accepts empty file path as unmap", async () => {
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

async function createTestContext() {
  const databaseFile = await Deno.makeTempFile({ suffix: ".sqlite" });
  const { app, runtime } = await bootstrap({
    bootstrapPassword: Redacted.make("admin"),
    bootstrapUsername: "admin",
    databaseFile,
    port: 9999,
  });

  return {
    app,
    databaseFile,
    dispose: async () => {
      await runtime.dispose();
      await Deno.remove(databaseFile);
    },
  };
}
