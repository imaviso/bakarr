import { Effect } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import type { MediaEventPublisher } from "@/features/media/shared/media-orchestration-shared.ts";
import { scanMediaFolderEffect } from "@/features/media/files/media-file-scan.ts";
import type { MediaRepositoryShape } from "@/features/media/shared/media-repository.ts";
import type { MediaUnitRepositoryShape } from "@/features/media/units/media-unit-repository.ts";
import type { SystemLogRepositoryShape } from "@/features/system/repository/log-repository.ts";

export const scanMediaFolderOrchestrationEffect = Effect.fn(
  "MediaService.scanMediaFolderOrchestrationEffect",
)(function* (input: {
  mediaId: number;
  eventPublisher: MediaEventPublisher;
  fs: FileSystemShape;
  mediaReadRepository: MediaRepositoryShape;
  mediaUnitRepository: MediaUnitRepositoryShape;
  mediaProbe: MediaProbeShape;
  nowIso: () => Effect.Effect<string>;
  systemLogRepository: SystemLogRepositoryShape;
}) {
  const { nowIso } = input;
  const startAnimeRow = yield* input.mediaReadRepository.getMediaRow(input.mediaId);

  yield* input.eventPublisher.publish({
    type: "ScanFolderStarted",
    payload: {
      media_id: brandMediaId(input.mediaId),
      title: startAnimeRow.titleRomaji,
    },
  });

  const { animeRow, found, total } = yield* scanMediaFolderEffect({
    mediaId: input.mediaId,
    fs: input.fs,
    mediaReadRepository: input.mediaReadRepository,
    mediaUnitRepository: input.mediaUnitRepository,
    mediaProbe: input.mediaProbe,
    nowIso,
  });

  yield* input.systemLogRepository.appendLog(
    "media.folder.scanned",
    "success",
    `Scanned ${animeRow.titleRomaji} folder and found ${found} files`,
    nowIso,
  );
  yield* input.eventPublisher.publish({
    type: "ScanFolderFinished",
    payload: { media_id: brandMediaId(input.mediaId), found, title: animeRow.titleRomaji },
  });

  return { found, total };
});
