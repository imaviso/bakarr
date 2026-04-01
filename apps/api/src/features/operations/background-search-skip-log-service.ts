import { Context, Effect, Layer } from "effect";

export interface BackgroundSearchSkipLogServiceShape {
  readonly logRssSkip: (input: {
    animeId?: number;
    feedId: number;
    feedName: string;
    reason: string;
  }) => Effect.Effect<void, never>;
  readonly logSearchMissingSkip: (input: {
    animeId: number;
    episodeNumber: number;
    reason: string;
  }) => Effect.Effect<void, never>;
}

export class BackgroundSearchSkipLogService extends Context.Tag(
  "@bakarr/api/BackgroundSearchSkipLogService",
)<BackgroundSearchSkipLogService, BackgroundSearchSkipLogServiceShape>() {}

export const BackgroundSearchSkipLogServiceLive = Layer.succeed(
  BackgroundSearchSkipLogService,
  BackgroundSearchSkipLogService.of({
    logRssSkip: (input) =>
      Effect.logDebug("Skipping RSS background action").pipe(
        Effect.annotateLogs({
          animeId: input.animeId,
          feedId: input.feedId,
          feedName: input.feedName,
          reason: input.reason,
        }),
      ),
    logSearchMissingSkip: (input) =>
      Effect.logDebug("Skipping missing-episode background action").pipe(
        Effect.annotateLogs({
          animeId: input.animeId,
          episodeNumber: input.episodeNumber,
          reason: input.reason,
        }),
      ),
  }),
);
