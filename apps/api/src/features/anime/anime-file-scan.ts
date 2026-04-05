import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { MediaProbeShape } from "@/lib/media-probe.ts";
import { mergeProbedMediaMetadata, shouldProbeDetailedMediaMetadata } from "@/lib/media-probe.ts";
import {
  classifyMediaArtifact,
  parseFileSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/lib/media-identity.ts";
import { collectVideoFiles } from "@/features/anime/files.ts";
import { buildScannedFileMetadata } from "@/lib/scanned-file-metadata.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
import { buildAiringScheduleMap } from "@/features/anime/anime-schedule-repository.ts";
import { inferAiredAt } from "@/lib/anime-derivations.ts";
import { upsertEpisodeEffect } from "@/features/anime/anime-episode-repository.ts";
import { AnimePathError } from "@/features/anime/errors.ts";

export const scanAnimeFolderEffect = Effect.fn("AnimeFileScan.scanAnimeFolderEffect")(
  function* (input: {
    animeId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mediaProbe: MediaProbeShape;
    nowIso: () => Effect.Effect<string>;
  }) {
    const animeRow = yield* getAnimeRowEffect(input.db, input.animeId);
    const files = yield* collectVideoFiles(input.fs, animeRow.rootFolder).pipe(
      Effect.mapError(
        (cause) =>
          new AnimePathError({
            cause,
            message: "Anime root folder does not exist or is inaccessible",
          }),
      ),
    );

    let found = 0;
    const airingScheduleByEpisode = buildAiringScheduleMap(
      animeRow.nextAiringAt && animeRow.nextAiringEpisode
        ? [
            {
              airingAt: animeRow.nextAiringAt,
              episode: animeRow.nextAiringEpisode,
            },
          ]
        : undefined,
    );

    for (const file of files) {
      const classification = classifyMediaArtifact(file.path, file.name);
      if (classification.kind === "extra" || classification.kind === "sample") {
        continue;
      }

      const parsed = parseFileSourceIdentity(file.path);
      const metadata = buildScannedFileMetadata({
        filePath: file.path,
        ...(parsed.group === undefined ? {} : { group: parsed.group }),
        ...(toSharedParsedEpisodeIdentity(parsed.source_identity) === undefined
          ? {}
          : { sourceIdentity: toSharedParsedEpisodeIdentity(parsed.source_identity) }),
      });

      const probeInput = {
        ...(metadata.audio_channels === undefined
          ? {}
          : { audio_channels: metadata.audio_channels }),
        ...(metadata.audio_codec === undefined ? {} : { audio_codec: metadata.audio_codec }),
        ...(metadata.duration_seconds === undefined
          ? {}
          : { duration_seconds: metadata.duration_seconds }),
        ...(parsed.resolution === undefined ? {} : { resolution: parsed.resolution }),
        ...(metadata.video_codec === undefined ? {} : { video_codec: metadata.video_codec }),
      };

      const probeResult = shouldProbeDetailedMediaMetadata(probeInput)
        ? yield* input.mediaProbe.probeVideoFile(file.path)
        : undefined;

      const mergedMetadata = mergeProbedMediaMetadata(
        probeInput,
        probeResult?._tag === "MediaProbeMetadataFound" ? probeResult.metadata : undefined,
      );

      const identity = parsed.source_identity;
      if (!identity || identity.scheme === "daily") {
        continue;
      }

      const episodeNumbers = identity.episode_numbers;
      if (episodeNumbers.length === 0) {
        continue;
      }

      const currentIso = yield* input.nowIso();

      for (const episodeNumber of episodeNumbers) {
        yield* upsertEpisodeEffect(input.db, input.animeId, episodeNumber, {
          aired: inferAiredAt(
            animeRow.status,
            episodeNumber,
            animeRow.episodeCount ?? undefined,
            animeRow.startDate ?? undefined,
            animeRow.endDate ?? undefined,
            airingScheduleByEpisode,
            currentIso,
          ),
          downloaded: true,
          filePath: file.path,
          fileSize: file.size,
          ...(mergedMetadata.duration_seconds === undefined
            ? {}
            : { durationSeconds: mergedMetadata.duration_seconds }),
          groupName: parsed.group ?? null,
          ...(mergedMetadata.resolution === undefined
            ? {}
            : { resolution: mergedMetadata.resolution }),
          ...(metadata.quality === undefined ? {} : { quality: metadata.quality }),
          ...(mergedMetadata.video_codec === undefined
            ? {}
            : { videoCodec: mergedMetadata.video_codec }),
          ...(mergedMetadata.audio_codec === undefined
            ? {}
            : { audioCodec: mergedMetadata.audio_codec }),
          ...(mergedMetadata.audio_channels === undefined
            ? {}
            : { audioChannels: mergedMetadata.audio_channels }),
          title: null,
        });
      }
      found += episodeNumbers.length;
    }

    return {
      animeRow,
      found,
      total: files.length,
    };
  },
);
