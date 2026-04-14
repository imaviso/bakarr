import type { AnimeMetadataEpisode } from "@/features/anime/anilist-model.ts";

export function mergeAnimeMetadataEpisodes(
  primary: ReadonlyArray<AnimeMetadataEpisode> | undefined,
  fallback: ReadonlyArray<AnimeMetadataEpisode> | undefined,
): ReadonlyArray<AnimeMetadataEpisode> | undefined {
  const byNumber = new Map<number, AnimeMetadataEpisode>();

  for (const episode of primary ?? []) {
    byNumber.set(episode.number, {
      ...(episode.aired === undefined ? {} : { aired: episode.aired }),
      ...(episode.durationSeconds === undefined
        ? {}
        : { durationSeconds: episode.durationSeconds }),
      number: episode.number,
      ...(episode.title === undefined ? {} : { title: episode.title }),
    });
  }

  for (const episode of fallback ?? []) {
    const existing = byNumber.get(episode.number);
    const aired = existing?.aired ?? episode.aired;
    const durationSeconds = existing?.durationSeconds ?? episode.durationSeconds;
    const title = existing?.title ?? episode.title;

    byNumber.set(episode.number, {
      ...(aired === undefined ? {} : { aired }),
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      number: episode.number,
      ...(title === undefined ? {} : { title }),
    });
  }

  return byNumber.size === 0
    ? undefined
    : [...byNumber.values()].toSorted((left, right) => left.number - right.number);
}
