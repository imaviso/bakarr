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

    if (Option.isNone(metadata)) {
      return { animeRow, metadata: undefined, nextAnimeRow: animeRow };
    }
    const metadataValue = metadata.value;

    const relatedAnime = yield* encodeAnimeDiscoveryEntries(metadataValue.relatedAnime);
    const recommendedAnime = yield* encodeAnimeDiscoveryEntries(metadataValue.recommendedAnime);
    const synonyms = yield* encodeAnimeSynonyms(metadataValue.synonyms);

    const nextAnimeRow = {
      ...animeRow,
      bannerImage: metadataValue.bannerImage ?? animeRow.bannerImage,
      coverImage: metadataValue.coverImage ?? animeRow.coverImage,
      description: metadataValue.description ?? animeRow.description,
      endDate: metadataValue.endDate ?? null,
      endYear: metadataValue.endYear ?? null,
      episodeCount: metadataValue.episodeCount ?? animeRow.episodeCount,
      format: metadataValue.format,
      malId: metadataValue.malId ?? animeRow.malId,
      nextAiringAt: metadataValue.nextAiringEpisode?.airingAt ?? null,
      nextAiringEpisode: metadataValue.nextAiringEpisode?.episode ?? null,
      recommendedAnime,
      relatedAnime,
      score: metadataValue.score ?? animeRow.score,
      startDate: metadataValue.startDate ?? null,
      startYear: metadataValue.startYear ?? null,
      status: metadataValue.status,
      synonyms,
      titleEnglish: metadataValue.title.english ?? animeRow.titleEnglish,
      titleNative: metadataValue.title.native ?? animeRow.titleNative,
      titleRomaji: metadataValue.title.romaji,
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

    return { animeRow, metadata: metadataValue, nextAnimeRow };
  },
);
