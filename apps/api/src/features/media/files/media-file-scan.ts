import { Effect } from "effect";
import { and, eq, isNotNull } from "drizzle-orm";

import type { AppDatabase } from "@/db/database.ts";
import { mediaUnits } from "@/db/schema.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import {
  mergeProbedMediaMetadata,
  probeMediaMetadataOrUndefined,
  shouldProbeDetailedMediaMetadata,
} from "@/infra/media/probe.ts";
import {
  classifyMediaArtifact,
  parseFileSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/infra/media/identity/identity.ts";
import {
  collectVideoFiles,
  collectVolumeFiles,
  extractUnitNumbersFromFile,
} from "@/features/media/files/files.ts";
import { buildScannedFileMetadata } from "@/infra/scanned-file-metadata.ts";
import type { MediaReadRepositoryShape } from "@/features/media/shared/media-read-repository.ts";
import { buildAiringScheduleMap } from "@/features/media/units/media-schedule-repository.ts";
import { inferAiredAt } from "@/domain/media/derivations.ts";
import {
  clearEpisodeMappingEffect,
  upsertEpisodeEffect,
} from "@/features/media/units/media-unit-repository.ts";
import { MediaPathError } from "@/features/media/errors.ts";
import { tryDatabasePromise } from "@/infra/effect/db.ts";

export const scanAnimeFolderEffect = Effect.fn("AnimeFileScan.scanAnimeFolderEffect")(
  function* (input: {
    mediaId: number;
    db: AppDatabase;
    fs: FileSystemShape;
    mediaReadRepository: MediaReadRepositoryShape;
    mediaProbe: MediaProbeShape;
    nowIso: () => Effect.Effect<string>;
  }) {
    const animeRow = yield* input.mediaReadRepository.getAnimeRow(input.mediaId);
    const collectFiles = animeRow.mediaKind === "anime" ? collectVideoFiles : collectVolumeFiles;
    const files = yield* collectFiles(input.fs, animeRow.rootFolder).pipe(
      Effect.mapError(
        (cause) =>
          new MediaPathError({
            cause,
            message: "Media root folder does not exist or is inaccessible",
          }),
      ),
    );

    yield* clearMissingEpisodeFileMappingsEffect(
      input.db,
      input.mediaId,
      files.map((file) => file.path),
    );

    let found = 0;
    const airingScheduleByEpisode = buildAiringScheduleMap(
      animeRow.nextAiringAt && animeRow.nextAiringUnit
        ? [
            {
              airingAt: animeRow.nextAiringAt,
              episode: animeRow.nextAiringUnit,
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

      const probedMetadata = shouldProbeDetailedMediaMetadata(probeInput)
        ? yield* probeMediaMetadataOrUndefined(input.mediaProbe, file.path)
        : undefined;

      const mergedMetadata = mergeProbedMediaMetadata(probeInput, probedMetadata);

      const isVolumeMedia = animeRow.mediaKind !== "anime";
      const unitNumbers = extractUnitNumbersFromFile(file.name, file.path, isVolumeMedia);
      if (unitNumbers.length === 0) {
        continue;
      }

      const currentIso = yield* input.nowIso();

      for (const unitNumber of unitNumbers) {
        yield* upsertEpisodeEffect(input.db, input.mediaId, unitNumber, {
          aired: inferAiredAt(
            animeRow.status,
            unitNumber,
            animeRow.unitCount ?? undefined,
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
      found += unitNumbers.length;
    }

    return {
      animeRow,
      found,
      total: files.length,
    };
  },
);

const clearMissingEpisodeFileMappingsEffect = Effect.fn(
  "AnimeFileScan.clearMissingEpisodeFileMappingsEffect",
)(function* (db: AppDatabase, mediaId: number, presentFilePaths: readonly string[]) {
  const presentFilePathSet = new Set(presentFilePaths);
  const mappedRows = yield* tryDatabasePromise("Failed to list mapped episode files", () =>
    db
      .select({ filePath: mediaUnits.filePath, number: mediaUnits.number })
      .from(mediaUnits)
      .where(and(eq(mediaUnits.mediaId, mediaId), isNotNull(mediaUnits.filePath))),
  );

  for (const row of mappedRows) {
    if (row.filePath !== null && !presentFilePathSet.has(row.filePath)) {
      yield* clearEpisodeMappingEffect(db, mediaId, row.number);
    }
  }
});
