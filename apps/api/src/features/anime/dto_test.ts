import { assertEquals } from "@std/assert";

import { anime, episodes } from "../../db/schema.ts";
import { toAnimeDto } from "./dto.ts";

Deno.test("toAnimeDto builds progress, metadata, and decoded arrays", () => {
  const result = toAnimeDto(
    {
      addedAt: "2024-01-01T00:00:00.000Z",
      bannerImage: "/api/images/anime/20/banner.jpg",
      coverImage: "/api/images/anime/20/cover.jpg",
      description: "A ninja story",
      endDate: null,
      episodeCount: 4,
      format: "TV",
      genres: '["Action","Adventure"]',
      id: 20,
      malId: 1735,
      monitored: true,
      profileName: "Default",
      releaseProfileIds: "[1,2]",
      rootFolder: "/library/Naruto",
      score: 79,
      startDate: null,
      status: "RELEASING",
      studios: '["Studio Pierrot"]',
      titleEnglish: "Naruto",
      titleNative: "ナルト",
      titleRomaji: "Naruto",
    } satisfies typeof anime.$inferSelect,
    [
      {
        aired: null,
        animeId: 20,
        downloaded: true,
        filePath: "/library/Naruto/Naruto - 01.mkv",
        id: 1,
        number: 1,
        title: null,
      },
      {
        aired: null,
        animeId: 20,
        downloaded: false,
        filePath: null,
        id: 2,
        number: 2,
        title: null,
      },
      {
        aired: null,
        animeId: 20,
        downloaded: true,
        filePath: "/library/Naruto/Naruto - 03.mkv",
        id: 3,
        number: 3,
        title: null,
      },
    ] satisfies Array<typeof episodes.$inferSelect>,
  );

  assertEquals(result.id, 20);
  assertEquals(result.genres, ["Action", "Adventure"]);
  assertEquals(result.studios, ["Studio Pierrot"]);
  assertEquals(result.release_profile_ids, [1, 2]);
  assertEquals(result.progress.downloaded, 2);
  assertEquals(result.progress.total, 4);
  assertEquals(result.progress.missing, [2, 4]);
  assertEquals(result.title.english, "Naruto");
  assertEquals(result.banner_image, "/api/images/anime/20/banner.jpg");
});

Deno.test("toAnimeDto handles anime with unknown episode totals", () => {
  const result = toAnimeDto(
    {
      addedAt: "2024-01-01T00:00:00.000Z",
      bannerImage: null,
      coverImage: null,
      description: null,
      endDate: null,
      episodeCount: null,
      format: "MOVIE",
      genres: "[]",
      id: 99,
      malId: null,
      monitored: false,
      profileName: "Default",
      releaseProfileIds: "[]",
      rootFolder: "/library/Movie",
      score: null,
      startDate: null,
      status: "FINISHED",
      studios: "[]",
      titleEnglish: null,
      titleNative: null,
      titleRomaji: "Movie",
    } satisfies typeof anime.$inferSelect,
    [],
  );

  assertEquals(result.progress.total, undefined);
  assertEquals(result.progress.missing, []);
  assertEquals(result.cover_image, undefined);
  assertEquals(result.score, undefined);
});
