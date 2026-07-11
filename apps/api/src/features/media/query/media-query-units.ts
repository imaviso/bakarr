import { Effect } from "effect";

import type { MediaUnit } from "@packages/shared/index.ts";
import { deriveEpisodeTimelineMetadata } from "@/domain/media/derivations.ts";
import type { MediaReadRepositoryShape } from "@/features/media/shared/media-read-repository.ts";

export const listEpisodesEffect = Effect.fn("MediaQueryUnits.listEpisodesEffect")(
  function* (input: { mediaId: number; mediaReadRepository: MediaReadRepositoryShape; now: Date }) {
    const rows = yield* input.mediaReadRepository.listUnitRowsWithMediaKind(input.mediaId);

    return rows
      .toSorted((left, right) => left.episode.number - right.episode.number)
      .map((row): MediaUnit => {
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
