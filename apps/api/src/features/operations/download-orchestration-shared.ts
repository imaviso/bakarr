export interface TriggerDownloadInput {
  readonly anime_id: number;
  readonly magnet: string;
  readonly episode_number?: number;
  readonly title: string;
  readonly is_batch?: boolean;
  readonly release_context?: import("@packages/shared/index.ts").SearchDownloadReleaseContext;
}

export function resolveRequestedEpisodeNumber(input: {
  readonly explicitEpisode?: number;
  readonly inferredEpisodes: readonly number[];
  readonly isBatch: boolean;
}) {
  if (input.explicitEpisode && input.explicitEpisode > 0) {
    return input.explicitEpisode;
  }

  const [inferredEpisode] = input.inferredEpisodes;
  if (inferredEpisode && inferredEpisode > 0) {
    return inferredEpisode;
  }

  if (input.isBatch) {
    return 1;
  }

  return undefined;
}
