import type { Media } from "@bakarr/shared";

export type AnimeMonitorFilter = "all" | "monitored" | "unmonitored";

export function filterAnimeLibrary(
  animeList: Media[],
  query: string,
  monitorFilter: AnimeMonitorFilter,
): Media[] {
  const searchQuery = query.trim().toLowerCase();

  return animeList.filter((media) => {
    const matchesSearch =
      searchQuery.length === 0 ||
      media.title.romaji.toLowerCase().includes(searchQuery) ||
      media.title.english?.toLowerCase().includes(searchQuery) ||
      media.title.native?.toLowerCase().includes(searchQuery);

    const matchesMonitor =
      monitorFilter === "all" ||
      (monitorFilter === "monitored" && media.monitored) ||
      (monitorFilter === "unmonitored" && !media.monitored);

    return matchesSearch && matchesMonitor;
  });
}
