import type { Config } from "../../../../../packages/shared/src/index.ts";
import type { QBitConfig } from "./qbittorrent.ts";
import { QBitConfigModel } from "./qbittorrent.ts";

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
