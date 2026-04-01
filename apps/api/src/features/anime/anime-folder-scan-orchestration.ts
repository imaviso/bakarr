import { Effect } from "effect";

import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/lib/filesystem.ts";
import type { MediaProbeShape } from "@/lib/media-probe.ts";
import type { AnimeEventPublisher } from "@/features/anime/anime-orchestration-shared.ts";
import { scanAnimeFolderEffect } from "@/features/anime/anime-file-scan.ts";
import { appendSystemLog } from "@/features/system/support.ts";

export const scanAnimeFolderOrchestrationEffect = Effect.fn(
  "AnimeService.scanAnimeFolderOrchestrationEffect",
)(function* (input: {
  animeId: number;
  db: AppDatabase;
  eventPublisher: AnimeEventPublisher;
  fs: FileSystemShape;
  mediaProbe: MediaProbeShape;
  nowIso: () => Effect.Effect<string>;
}) {
  const { nowIso } = input;
  const { animeRow, found, total } = yield* scanAnimeFolderEffect({
    animeId: input.animeId,
    db: input.db,
    fs: input.fs,
    mediaProbe: input.mediaProbe,
    nowIso,
  });

  yield* appendSystemLog(
    input.db,
    "anime.folder.scanned",
    "success",
    `Scanned ${animeRow.titleRomaji} folder and found ${found} files`,
    nowIso,
  );
  yield* input.eventPublisher.publish({
    type: "ScanFolderFinished",
    payload: { anime_id: input.animeId, found, title: animeRow.titleRomaji },
  });

  return { found, total };
});
