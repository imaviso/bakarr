import { Effect } from "effect";
import { brandMediaId } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import type { AnimeEventPublisher } from "@/features/media/shared/media-orchestration-shared.ts";
import { scanAnimeFolderEffect } from "@/features/media/files/media-file-scan.ts";
import { getAnimeRowEffect } from "@/features/media/shared/media-read-repository.ts";
import { appendSystemLog } from "@/features/system/support.ts";

export const scanAnimeFolderOrchestrationEffect = Effect.fn(
  "AnimeService.scanAnimeFolderOrchestrationEffect",
)(function* (input: {
  mediaId: number;
  db: AppDatabase;
  eventPublisher: AnimeEventPublisher;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  nowIso: () => Effect.Effect<string>;
}) {
  const { nowIso } = input;
  const startAnimeRow = yield* getAnimeRowEffect(input.db, input.mediaId);

  yield* input.eventPublisher.publish({
    type: "ScanFolderStarted",
    payload: {
      media_id: brandMediaId(input.mediaId),
      title: startAnimeRow.titleRomaji,
    },
  });

  const { animeRow, found, total } = yield* scanAnimeFolderEffect({
    mediaId: input.mediaId,
    db: input.db,
    fs: input.fs,
    mediaProbe: input.mediaProbe,
    nowIso,
  });

  yield* appendSystemLog(
    input.db,
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
