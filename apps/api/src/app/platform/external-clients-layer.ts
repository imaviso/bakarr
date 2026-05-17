import { Layer } from "effect";

import { AniListClientLive, type AniListClient } from "@/features/media/metadata/anilist.ts";
import { AniDbClientLive, type AniDbClient } from "@/features/media/metadata/anidb.ts";
import { JikanClientLive, type JikanClient } from "@/features/media/metadata/jikan.ts";
import { ManamiClientLive, type ManamiClient } from "@/features/media/metadata/manami.ts";
import {
  QBitTorrentClientLive,
  type QBitTorrentClient,
} from "@/features/operations/qbittorrent/qbittorrent.ts";
import { RssClientLive, type RssClient } from "@/features/operations/rss/rss-client.ts";
import { RssTransportLive } from "@/features/operations/rss/rss-transport.ts";
import { SeaDexClientLive, type SeaDexClient } from "@/features/operations/search/seadex-client.ts";
import { DnsResolverLive } from "@/infra/dns-resolver.ts";

export interface AppExternalClientLayerOptions {
  readonly aniDbLayer?: Layer.Layer<AniDbClient>;
  readonly aniListLayer?: Layer.Layer<AniListClient>;
  readonly jikanLayer?: Layer.Layer<JikanClient>;
  readonly manamiLayer?: Layer.Layer<ManamiClient>;
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
  const jikanLayer = orDefault(options?.jikanLayer, JikanClientLive);
  const manamiLayer = orDefault(options?.manamiLayer, ManamiClientLive);
  const rssLayer = orDefault(options?.rssLayer, defaultRssLayer);
  const qbitLayer = orDefault(options?.qbitLayer, QBitTorrentClientLive);
  const seadexLayer = orDefault(options?.seadexLayer, SeaDexClientLive);

  return Layer.mergeAll(
    aniDbLayer,
    aniListLayer,
    jikanLayer,
    manamiLayer,
    rssLayer,
    qbitLayer,
    seadexLayer,
  );
}
