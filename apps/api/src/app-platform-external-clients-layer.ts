import { Layer } from "effect";

import { AniListClientLive, type AniListClient } from "@/features/anime/anilist.ts";
import { AniDbClientLive, type AniDbClient } from "@/features/anime/anidb.ts";
import {
  QBitTorrentClientLive,
  type QBitTorrentClient,
} from "@/features/operations/qbittorrent.ts";
import { RssClientLive, type RssClient } from "@/features/operations/rss-client.ts";
import { RssTransportLive } from "@/features/operations/rss-transport.ts";
import { SeaDexClientLive, type SeaDexClient } from "@/features/operations/seadex-client.ts";
import { DnsResolverLive } from "@/lib/dns-resolver.ts";

export interface AppExternalClientLayerOptions {
  readonly aniDbLayer?: Layer.Layer<AniDbClient>;
  readonly aniListLayer?: Layer.Layer<AniListClient>;
  readonly qbitLayer?: Layer.Layer<QBitTorrentClient>;
  readonly rssLayer?: Layer.Layer<RssClient>;
  readonly seadexLayer?: Layer.Layer<SeaDexClient>;
}

export function makeAppExternalClientLayer(options?: AppExternalClientLayerOptions) {
  const aniDbLayer = options?.aniDbLayer ? options.aniDbLayer : AniDbClientLive;
  const aniListLayer = options?.aniListLayer ? options.aniListLayer : AniListClientLive;
  const rssLayer = options?.rssLayer
    ? options.rssLayer
    : RssClientLive.pipe(Layer.provide(Layer.mergeAll(DnsResolverLive, RssTransportLive)));
  const qbitLayer = options?.qbitLayer ? options.qbitLayer : QBitTorrentClientLive;
  const seadexLayer = options?.seadexLayer ? options.seadexLayer : SeaDexClientLive;

  return Layer.mergeAll(aniDbLayer, aniListLayer, rssLayer, qbitLayer, seadexLayer);
}
