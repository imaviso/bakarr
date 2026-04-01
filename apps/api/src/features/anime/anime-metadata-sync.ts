import { eq } from "drizzle-orm";
import { Effect, Option } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import { anime } from "@/db/schema.ts";
import type { AniListClient } from "@/features/anime/anilist.ts";
import type { AnimeEventPublisher } from "@/features/anime/anime-orchestration-shared.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
import {
  encodeAnimeDiscoveryEntries,
  encodeAnimeSynonyms,
} from "@/features/anime/discovery-metadata-codec.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { appendSystemLog } from "@/features/system/support.ts";

export const syncAnimeMetadataEffect = Effect.fn("AnimeMetadataSync.syncAnimeMetadata")(
  function* (input: {
    aniList: typeof AniListClient.Service;
    animeId: number;
    db: AppDatabase;
    eventPublisher: Option.Option<AnimeEventPublisher>;
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

    yield* tryDatabasePromise("Failed to update anime", () =>
      input.db.update(anime).set(nextAnimeRow).where(eq(anime.id, input.animeId)),
    );

    const message = `Refreshed metadata for ${animeRow.titleRomaji}`;
    yield* appendSystemLog(input.db, "anime.updated", "success", message, nowIso);

    // Only publish event if publisher is provided
    yield* Option.match(input.eventPublisher, {
      onNone: () => Effect.void,
      onSome: (publisher) => publisher.publishInfo(message),
    });

    return { animeRow, metadata, nextAnimeRow };
  },
);
