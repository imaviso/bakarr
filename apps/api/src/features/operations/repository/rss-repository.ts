import { brandMediaId, brandRssFeedId, type RssFeed } from "@packages/shared/index.ts";

export function toRssFeed(row: {
  mediaId: number;
  createdAt: string;
  enabled: boolean;
  id: number;
  lastChecked: string | null;
  name: string | null;
  url: string;
}): RssFeed {
  return {
    media_id: brandMediaId(row.mediaId),
    created_at: row.createdAt,
    enabled: row.enabled,
    id: brandRssFeedId(row.id),
    last_checked: row.lastChecked ?? undefined,
    name: row.name ?? undefined,
    url: row.url,
  };
}
