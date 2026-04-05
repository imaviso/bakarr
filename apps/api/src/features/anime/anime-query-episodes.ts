import { eq } from "drizzle-orm";
import { Effect } from "effect";

import type { Episode } from "@packages/shared/index.ts";
import type { AppDatabase } from "@/db/database.ts";
import { episodes } from "@/db/schema.ts";
import { tryDatabasePromise } from "@/lib/effect-db.ts";
import { deriveEpisodeTimelineMetadata } from "@/lib/anime-derivations.ts";

export const listEpisodesEffect = Effect.fn("AnimeQueryEpisodes.listEpisodesEffect")(
  function* (input: { animeId: number; db: AppDatabase; now: Date }) {
    const rows = yield* tryDatabasePromise("Failed to list episodes", () =>
      input.db.select().from(episodes).where(eq(episodes.animeId, input.animeId)),
    );

    return rows
      .toSorted((left, right) => left.number - right.number)
      .map((row): Episode => {
        const timeline = deriveEpisodeTimelineMetadata(row.aired ?? undefined, input.now);

        return {
          aired: row.aired ?? undefined,
          airing_status: timeline.airing_status,
          audio_channels: row.audioChannels ?? undefined,
          audio_codec: row.audioCodec ?? undefined,
          downloaded: row.downloaded,
          duration_seconds: row.durationSeconds ?? undefined,
          file_path: row.filePath ?? undefined,
          file_size: row.fileSize ?? undefined,
          group: row.groupName ?? undefined,
          is_future: timeline.is_future,
          number: row.number,
          quality: row.quality ?? undefined,
          resolution: row.resolution ?? undefined,
          title: row.title ?? undefined,
          video_codec: row.videoCodec ?? undefined,
        };
      });
  },
);
