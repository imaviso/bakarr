import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import type { AnimeEventPublisher } from "@/features/anime/anime-orchestration-shared.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/anime/discovery-metadata-codec.ts";
import { updateAnimeRow } from "@/features/anime/update-support.ts";

export const syncAnimeMetadataEffect = Effect.fn("AnimeService.syncAnimeMetadataEffect")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeId: number;
    db: AppDatabase;
    eventPublisher: AnimeEventPublisher;
    nowIso: () => Effect.Effect<string>;
  }) {
    const { nowIso } = input;
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId);
    const metadata = yield* input.aniList.getAnimeMetadataById(input.animeId);

    if (!metadata) {
      return { animeRow, metadata: undefined, nextAnimeRow: animeRow };
    }

    const nextAnimeRow = {
      ...animeRow,
      bannerImage: metadata.bannerImage ?? animeRow.bannerImage,
      coverImage: metadata.coverImage ?? animeRow.coverImage,
      description: metadata.description ?? animeRow.description,
      endDate: metadata.endDate ?? null,
      endYear: metadata.endYear ?? null,
      episodeCount: metadata.episodeCount ?? animeRow.episodeCount,
      format: metadata.format,
      malId: metadata.malId ?? animeRow.malId,
      nextAiringAt: metadata.nextAiringEpisode?.airingAt ?? null,
      nextAiringEpisode: metadata.nextAiringEpisode?.episode ?? null,
      recommendedAnime: encodeAnimeDiscoveryEntries(metadata.recommendedAnime),
      relatedAnime: encodeAnimeDiscoveryEntries(metadata.relatedAnime),
      score: metadata.score ?? animeRow.score,
      startDate: metadata.startDate ?? null,
      startYear: metadata.startYear ?? null,
      status: metadata.status,
      synonyms: encodeAnimeSynonyms(metadata.synonyms),
      titleEnglish: metadata.title.english ?? animeRow.titleEnglish,
      titleNative: metadata.title.native ?? animeRow.titleNative,
      titleRomaji: metadata.title.romaji,
    };

    yield* updateAnimeRow(
      input.db,
      input.animeId,
      nextAnimeRow,
      `Refreshed metadata for ${animeRow.titleRomaji}`,
      input.eventPublisher,
      nowIso,
    );

    return { animeRow, metadata, nextAnimeRow };
  },
);
