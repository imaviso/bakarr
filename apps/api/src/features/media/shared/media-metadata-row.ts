import type { AnimeMetadata } from "@/features/media/metadata/metadata-model.ts";
import { media } from "@/db/schema.ts";

/**
 * Canonical merge of provider metadata (plus cached image paths) into media row
 * fields. Shared by enrollment (no `previous`) and metadata sync (`previous` is
 * the existing row, so stale-but-present fields are preserved).
 *
 * - keep-previous: `metadata ?? previous ?? null` — new value wins, else keep
 *   what was already stored, else null.
 * - overwrite-null: `metadata ?? null` — a missing provider value resets the
 *   stored value to null (dates track provider truth, not history).
 * - always-set: provider value is authoritative.
 *
 * `genres` / `studios` are intentionally NOT produced here: enrollment encodes
 * them from provider metadata, sync leaves them untouched.
 */
const keep = <T>(value: T | undefined, previousValue: T | null | undefined): T | null =>
  value ?? previousValue ?? null;

export function toMediaRowFields(input: {
  metadata: AnimeMetadata;
  bannerImage?: string | null;
  coverImage?: string | null;
  previous?: typeof media.$inferSelect;
}) {
  const { metadata, previous } = input;

  return {
    background: keep(metadata.background, previous?.background),
    bannerImage: keep(input.bannerImage, previous?.bannerImage),
    coverImage: keep(input.coverImage, previous?.coverImage),
    description: keep(metadata.description, previous?.description),
    duration: keep(metadata.duration, previous?.duration),
    unitCount: keep(metadata.unitCount, previous?.unitCount),
    favorites: keep(metadata.favorites, previous?.favorites),
    malId: keep(metadata.malId, previous?.malId),
    members: keep(metadata.members, previous?.members),
    popularity: keep(metadata.popularity, previous?.popularity),
    rank: keep(metadata.rank, previous?.rank),
    rating: keep(metadata.rating, previous?.rating),
    score: keep(metadata.score, previous?.score),
    source: keep(metadata.source, previous?.source),
    titleEnglish: keep(metadata.title.english, previous?.titleEnglish),
    titleNative: keep(metadata.title.native, previous?.titleNative),
    endDate: metadata.endDate ?? null,
    endYear: metadata.endYear ?? null,
    startDate: metadata.startDate ?? null,
    startYear: metadata.startYear ?? null,
    nextAiringAt: metadata.nextAiringUnit?.airingAt ?? null,
    nextAiringUnit: metadata.nextAiringUnit?.episode ?? null,
    format: metadata.format,
    status: metadata.status,
    titleRomaji: metadata.title.romaji,
  };
}
