import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { Episode } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { anime, episodes } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";
import { deriveEpisodeTimelineMetadata } from "@/domain/anime/derivations.ts";

export const listEpisodesEffect = Effect.fn("AnimeQueryEpisodes.listEpisodesEffect")(
  function* (input: { animeId: number; db: AppDatabase; now: Date }) {
    const rows = yield* tryDatabasePromise("Failed to list episodes", () =>
      input.db
        .select({ episode: episodes, mediaKind: anime.mediaKind })
        .from(episodes)
        .innerJoin(anime, eq(anime.id, episodes.animeId))
        .where(eq(episodes.animeId, input.animeId)),
    );

    return rows
      .toSorted((left, right) => left.episode.number - right.episode.number)
      .map((row): Episode => {
        const episodeRow = row.episode;
        const timeline = deriveEpisodeTimelineMetadata(episodeRow.aired ?? undefined, input.now);

        return {
          aired: episodeRow.aired ?? undefined,
          airing_status: timeline.airing_status,
          audio_channels: episodeRow.audioChannels ?? undefined,
          audio_codec: episodeRow.audioCodec ?? undefined,
          downloaded: episodeRow.downloaded,
          duration_seconds: episodeRow.durationSeconds ?? undefined,
          file_path: episodeRow.filePath ?? undefined,
          file_size: episodeRow.fileSize ?? undefined,
          group: episodeRow.groupName ?? undefined,
          is_future: timeline.is_future,
          number: episodeRow.number,
          quality: episodeRow.quality ?? undefined,
          resolution: episodeRow.resolution ?? undefined,
          title: episodeRow.title ?? undefined,
          unit_kind: row.mediaKind === "anime" ? "episode" : "volume",
          video_codec: episodeRow.videoCodec ?? undefined,
        };
      });
  },
);
