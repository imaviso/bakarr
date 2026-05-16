export const MAX_INFERRED_EPISODE_NUMBER = 2000;

export function clampInferredEpisodeUpperBound(value: number | undefined) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return Math.min(value, MAX_INFERRED_EPISODE_NUMBER);
}
