import type { Anime } from "@bakarr/shared";
import { it } from "vitest";
import { filterAnimeLibrary } from "./library-filter";

function createAnime(input: {
  id: number;
  romaji: string;
  english?: string;
  native?: string;
  monitored: boolean;
}): Anime {
  return {
    id: input.id,
    title: {
      romaji: input.romaji,
      english: input.english,
      native: input.native,
    },
    format: "TV",
    status: "RELEASING",
    profile_name: "Default",
    root_folder: "/library/anime",
    added_at: "2025-01-01T00:00:00.000Z",
    monitored: input.monitored,
    release_profile_ids: [],
    progress: {
      downloaded: 0,
      missing: [],
    },
  };
}

const FIXTURE: Anime[] = [
  createAnime({ id: 1, romaji: "ONE PIECE", english: "One Piece", monitored: true }),
  createAnime({ id: 2, romaji: "Naruto", english: "Naruto", monitored: true }),
  createAnime({ id: 3, romaji: "Hunter x Hunter", english: "Hunter x Hunter", monitored: false }),
];

function assertIds(actual: Anime[], expected: number[]) {
  const ids = actual.map((item) => item.id);
  const sameLength = ids.length === expected.length;
  const sameOrder = ids.every((id, index) => id === expected[index]);
  if (!sameLength || !sameOrder) {
    throw new Error(`Expected ids [${expected.join(", ")}], got [${ids.join(", ")}]`);
  }
}

it("returns all anime with empty query and all filter", () => {
  assertIds(filterAnimeLibrary(FIXTURE, "", "all"), [1, 2, 3]);
});

it("filters by search query using case-insensitive title matching", () => {
  assertIds(filterAnimeLibrary(FIXTURE, "nar", "all"), [2]);
  assertIds(filterAnimeLibrary(FIXTURE, "hUn", "all"), [3]);
});

it("trims search query before matching", () => {
  assertIds(filterAnimeLibrary(FIXTURE, "  one  ", "all"), [1]);
});

it("applies monitored filter deterministically", () => {
  assertIds(filterAnimeLibrary(FIXTURE, "", "monitored"), [1, 2]);
  assertIds(filterAnimeLibrary(FIXTURE, "", "unmonitored"), [3]);
});

it("combines search and monitored filter", () => {
  assertIds(filterAnimeLibrary(FIXTURE, "h", "monitored"), []);
  assertIds(filterAnimeLibrary(FIXTURE, "h", "unmonitored"), [3]);
});
