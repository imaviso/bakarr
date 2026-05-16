import { brandAnimeId, brandRssFeedId, type RssFeed } from "@packages/shared/index.ts";

export function toRssFeed(row: {
  animeId: number;
  createdAt: string;
  enabled: boolean;
  id: number;
  lastChecked: string | null;
  name: string | null;
  url: string;
}): RssFeed {
  return {
    anime_id: brandAnimeId(row.animeId),
    created_at: row.createdAt,
    enabled: row.enabled,
    id: brandRssFeedId(row.id),
    last_checked: row.lastChecked ?? undefined,
    name: row.name ?? undefined,
    url: row.url,
  };
}
