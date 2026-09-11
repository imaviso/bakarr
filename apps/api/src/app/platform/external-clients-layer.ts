import { Layer } from "effect";

import { AniListClientLive, type AniListClient } from "@/features/media/metadata/anilist.ts";
import { AniDbClientLive, type AniDbClient } from "@/features/media/metadata/anidb.ts";
import { TenraiClientLive, type TenraiClient } from "@/features/media/metadata/tenrai.ts";
import {
  QBitTorrentClientLive,
  type QBitTorrentClient,
} from "@/features/operations/qbittorrent/qbittorrent.ts";
import { RssClientLive, type RssClient } from "@/features/operations/rss/rss-client.ts";
import { RssTransportLive } from "@/features/operations/rss/rss-transport.ts";
import { SeaDexClientLive, type SeaDexClient } from "@/features/operations/search/seadex-client.ts";
import { DnsResolverLive } from "@/security/dns-resolver.ts";

export interface AppExternalClientLayerOptions {
  readonly aniDbLayer?: Layer.Layer<AniDbClient>;
  readonly aniListLayer?: Layer.Layer<AniListClient>;
  readonly tenraiLayer?: Layer.Layer<TenraiClient>;
  readonly qbitLayer?: Layer.Layer<QBitTorrentClient>;
  readonly rssLayer?: Layer.Layer<RssClient>;
  readonly seadexLayer?: Layer.Layer<SeaDexClient>;
}

const defaultRssLayer = RssClientLive.pipe(
  Layer.provide(Layer.mergeAll(DnsResolverLive, RssTransportLive)),
);

const orDefault = <A>(value: A | undefined, fallback: A): A => value ?? fallback;

export function makeAppExternalClientLayer(options?: AppExternalClientLayerOptions) {
  const aniDbLayer = orDefault(options?.aniDbLayer, AniDbClientLive);
  const aniListLayer = orDefault(options?.aniListLayer, AniListClientLive);
  const tenraiLayer = orDefault(options?.tenraiLayer, TenraiClientLive);
  const rssLayer = orDefault(options?.rssLayer, defaultRssLayer);
  const qbitLayer = orDefault(options?.qbitLayer, QBitTorrentClientLive);
  const seadexLayer = orDefault(options?.seadexLayer, SeaDexClientLive);

  return Layer.mergeAll(aniDbLayer, aniListLayer, tenraiLayer, rssLayer, qbitLayer, seadexLayer);
}
