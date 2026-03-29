import type { Config } from "@packages/shared/index.ts";
import type { QBitConfig } from "@/features/operations/qbittorrent.ts";
import { QBitConfigModel } from "@/features/operations/qbittorrent.ts";

export function maybeQBitConfig(config: Config): QBitConfig | null {
  if (!config.qbittorrent.enabled || !config.qbittorrent.password) {
    return null;
  }

  return new QBitConfigModel({
    baseUrl: config.qbittorrent.url,
    category: config.qbittorrent.default_category,
    password: config.qbittorrent.password,
    username: config.qbittorrent.username,
  });
}
