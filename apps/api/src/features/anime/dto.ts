import type { Anime } from "../../../../../packages/shared/src/index.ts";
import { anime, episodes } from "../../db/schema.ts";
import { decodeNumberList, decodeStringList } from "../system/config-codec.ts";

export function toAnimeDto(
  row: typeof anime.$inferSelect,
  episodeRows: Array<typeof episodes.$inferSelect>,
): Anime {
  const downloadedEpisodes = episodeRows.filter((episode) => episode.downloaded)
    .map((episode) => episode.number).sort((left, right) => left - right);
  const total = row.episodeCount ?? undefined;
  const missing = total
    ? range(1, total).filter((number) => !downloadedEpisodes.includes(number))
    : [];

  return {
    added_at: row.addedAt,
    banner_image: row.bannerImage ?? undefined,
    cover_image: row.coverImage ?? undefined,
    description: row.description ?? undefined,
    episode_count: row.episodeCount ?? undefined,
    format: row.format,
    genres: decodeStringList(row.genres),
    id: row.id,
    mal_id: row.malId ?? undefined,
    monitored: row.monitored,
    profile_name: row.profileName,
    progress: {
      downloaded: downloadedEpisodes.length,
      missing,
      total,
    },
    release_profile_ids: decodeNumberList(row.releaseProfileIds),
    root_folder: row.rootFolder,
    score: row.score ?? undefined,
    status: row.status,
    studios: decodeStringList(row.studios),
    title: {
      english: row.titleEnglish ?? undefined,
      native: row.titleNative ?? undefined,
      romaji: row.titleRomaji,
    },
  };
}

function range(start: number, end: number) {
  return Array.from(
    { length: Math.max(end - start + 1, 0) },
    (_, index) => start + index,
  );
}
