import { assert, it } from "@effect/vitest";
import { brandMediaId } from "@packages/shared/index.ts";

import { media } from "@/db/schema.ts";
import {
  analyzeScannedFile,
  findBestLocalAnimeMatch,
  scoreAnimeRowMatch,
  titlesMatch,
} from "@/features/operations/library/library-import-analysis-support.ts";

type MediaRow = typeof media.$inferSelect;

function animeRow(input: Pick<MediaRow, "id" | "titleRomaji"> & Partial<MediaRow>): MediaRow {
  const row: MediaRow = {
    addedAt: "2025-01-01T00:00:00.000Z",
    bannerImage: null,
    background: null,
    coverImage: null,
    description: null,
    duration: null,
    endDate: null,
    endYear: null,
    unitCount: null,
    favorites: null,
    format: "TV",
    genres: "[]",
    id: input.id,
    mediaKind: "anime",
    malId: null,
    members: null,
    monitored: true,
    nextAiringAt: null,
    nextAiringUnit: null,
    popularity: null,
    profileName: "Default",
    rank: null,
    rating: null,
    recommendedMedia: null,
    relatedMedia: null,
    releaseProfileIds: "[]",
    rootFolder: `/library/${input.titleRomaji}`,
    score: null,
    source: null,
    startDate: null,
    startYear: null,
    status: "RELEASING",
    synonyms: null,
    studios: "[]",
    titleEnglish: null,
    titleNative: null,
    titleRomaji: input.titleRomaji,
  };

  return { ...row, ...input };
}

it("analyzeScannedFile marks daily identities as requiring manual mapping", () => {
  const result = analyzeScannedFile({
    name: "Show.2025-03-14.1080p.mkv",
    path: "/library/Show.2025-03-14.1080p.mkv",
  });

  assert.deepStrictEqual(result.scanned.air_date, "2025-03-14");
  assert.deepStrictEqual(result.scanned.needs_manual_mapping, true);
  assert.deepStrictEqual(
    result.scanned.match_reason,
    "Parsed a daily air date from the filename; choose the episode mapping before import",
  );
});

it("analyzeScannedFile maps archive volume labels to import unit numbers", () => {
  const result = analyzeScannedFile({
    name: "Witch Hat Atelier Vol. 07.cbz",
    path: "/library/Witch Hat Atelier Vol. 07.cbz",
  });

  assert.deepStrictEqual(result.scanned.unit_number, 7);
  assert.deepStrictEqual(result.scanned.unit_numbers, [7]);
  assert.deepStrictEqual(result.scanned.parsed_title, "Witch Hat Atelier");
  assert.deepStrictEqual(result.scanned.needs_manual_mapping, undefined);
});

it("scoreAnimeRowMatch and titlesMatch share normalized title scoring", () => {
  assert.deepStrictEqual(
    scoreAnimeRowMatch(
      "Dungeon Meshi",
      animeRow({ id: 1, titleEnglish: "Delicious in Dungeon", titleRomaji: "Dungeon Meshi" }),
    ),
    1,
  );
  assert.deepStrictEqual(
    titlesMatch("Dungeon Meshi", {
      id: brandMediaId(1),
      already_in_library: false,
      cover_image: undefined,
      description: undefined,
      unit_count: undefined,
      format: "TV",
      start_date: undefined,
      status: "FINISHED",
      synonyms: [],
      title: { english: "Delicious in Dungeon", native: undefined, romaji: "Dungeon Meshi" },
    }),
    true,
  );
});

it("findBestLocalAnimeMatch returns only matches above confidence threshold", () => {
  const rows = [
    animeRow({ id: 1, titleRomaji: "Unrelated Show" }),
    animeRow({ id: 2, titleEnglish: "Delicious in Dungeon", titleRomaji: "Dungeon Meshi" }),
  ];

  assert.deepStrictEqual(findBestLocalAnimeMatch("Dungeon Meshi", rows)?.id, 2);
  assert.deepStrictEqual(findBestLocalAnimeMatch("Completely Different", rows), undefined);
});
