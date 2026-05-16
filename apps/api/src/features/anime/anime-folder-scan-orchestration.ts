import { Effect } from "effect";
import { brandAnimeId } from "@packages/shared/index.ts";

import type { AppDatabase } from "@/db/database.ts";
import type { FileSystemShape } from "@/infra/filesystem/filesystem.ts";
import type { MediaProbeShape } from "@/infra/media/probe.ts";
import type { AnimeEventPublisher } from "@/features/anime/anime-orchestration-shared.ts";
import { scanAnimeFolderEffect } from "@/features/anime/anime-file-scan.ts";
import { getAnimeRowEffect } from "@/features/anime/anime-read-repository.ts";
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
  const startAnimeRow = yield* getAnimeRowEffect(input.db, input.animeId);

  yield* input.eventPublisher.publish({
    type: "ScanFolderStarted",
    payload: {
      anime_id: brandAnimeId(input.animeId),
      title: startAnimeRow.titleRomaji,
    },
  });

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
    payload: { anime_id: brandAnimeId(input.animeId), found, title: animeRow.titleRomaji },
  });

  return { found, total };
});
