import { Effect } from "effect";

import type { DownloadSourceMetadata, PreferredTitle } from "@packages/shared/index.ts";
import { anime } from "@/db/schema.ts";
import { buildEpisodeFilenamePlan } from "@/features/operations/naming-canonical-support.ts";
import type { ProbedMediaMetadata } from "@/infra/media/probe.ts";

export interface DownloadFileImportPlan {
  readonly backupDestination: string;
  readonly destination: string;
  readonly tempDestination: string;
}

export const buildDownloadFileImportPlan = Effect.fn("Operations.buildDownloadFileImportPlan")(
  function* (input: {
    readonly animeRow: typeof anime.$inferSelect;
    readonly episodeNumbers: readonly number[];
    readonly sourcePath: string;
    readonly randomUuid: () => Effect.Effect<string>;
    readonly options: {
      readonly namingFormat?: string;
      readonly preferredTitle?: PreferredTitle;
      readonly episodeRows?: readonly { title?: string | null; aired?: string | null }[];
      readonly downloadSourceMetadata?: DownloadSourceMetadata;
      readonly localMediaMetadata?: ProbedMediaMetadata;
      readonly season?: number;
    };
  }) {
    const extension = input.sourcePath.includes(".")
      ? input.sourcePath.slice(input.sourcePath.lastIndexOf("."))
      : ".mkv";
    const namingFormat = input.options.namingFormat ?? "{title} - {episode_segment}";
    const namingPlan = buildEpisodeFilenamePlan({
      animeRow: input.animeRow,
      episodeNumbers: input.episodeNumbers,
      filePath: input.sourcePath,
      namingFormat,
      preferredTitle: input.options.preferredTitle ?? "romaji",
      ...(input.options.episodeRows === undefined
        ? {}
        : { episodeRows: input.options.episodeRows }),
      ...(input.options.downloadSourceMetadata === undefined
        ? {}
        : { downloadSourceMetadata: input.options.downloadSourceMetadata }),
      ...(input.options.localMediaMetadata === undefined
        ? {}
        : { localMediaMetadata: input.options.localMediaMetadata }),
      ...(input.options.season === undefined ? {} : { season: input.options.season }),
    });
    const destination = `${input.animeRow.rootFolder.replace(/\/$/, "")}/${namingPlan.baseName}${extension}`;
    const tempSuffix = yield* input.randomUuid();
    const backupSuffix = yield* input.randomUuid();

    return {
      backupDestination: `${destination}.bak.${backupSuffix}`,
      destination,
      tempDestination: `${destination}.tmp.${tempSuffix}`,
    } satisfies DownloadFileImportPlan;
  },
);
