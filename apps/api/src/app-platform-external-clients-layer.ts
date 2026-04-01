import { FetchHttpClient } from "@effect/platform";
import { Layer } from "effect";

import { AniListClientLive, type AniListClient } from "@/features/anime/anilist.ts";
import {
  QBitTorrentClientLive,
  type QBitTorrentClient,
} from "@/features/operations/qbittorrent.ts";
import { RssClientLive, type RssClient } from "@/features/operations/rss-client.ts";
import { SeaDexClientLive, type SeaDexClient } from "@/features/operations/seadex-client.ts";
import { DnsResolverLive } from "@/lib/dns-resolver.ts";

export interface AppExternalClientLayerOptions {
  readonly aniListLayer?: Layer.Layer<AniListClient>;
  readonly qbitLayer?: Layer.Layer<QBitTorrentClient>;
  readonly rssLayer?: Layer.Layer<RssClient>;
  readonly seadexLayer?: Layer.Layer<SeaDexClient>;
}

export function makeAppExternalClientLayer(options?: AppExternalClientLayerOptions) {
  const externalClientSupportLayer = FetchHttpClient.layer;
  const dnsClientSupportLayer = Layer.mergeAll(externalClientSupportLayer, DnsResolverLive);

  const aniListLayer = options?.aniListLayer
    ? options.aniListLayer
    : AniListClientLive.pipe(Layer.provide(externalClientSupportLayer));
  const rssLayer = options?.rssLayer
    ? options.rssLayer
    : RssClientLive.pipe(Layer.provide(dnsClientSupportLayer));
  const qbitLayer = options?.qbitLayer
    ? options.qbitLayer
    : QBitTorrentClientLive.pipe(Layer.provide(externalClientSupportLayer));
  const seadexLayer = options?.seadexLayer
    ? options.seadexLayer
    : SeaDexClientLive.pipe(Layer.provide(externalClientSupportLayer));

  return Layer.mergeAll(aniListLayer, rssLayer, qbitLayer, seadexLayer);
}
