import { Effect } from "effect";
import type { MediaKind } from "@packages/shared/index.ts";

import { StoredDataError } from "@/features/errors.ts";

const MEDIA_KINDS: readonly MediaKind[] = ["anime", "manga", "light_novel"];

export const decodeStoredMediaKindEffect = Effect.fn("MediaKind.decodeStoredMediaKind")(function* (
  value: string,
) {
  for (const mediaKind of MEDIA_KINDS) {
    if (mediaKind === value) {
      return mediaKind;
    }
  }

  return yield* new StoredDataError({
    message: `Stored media kind is invalid: ${value}`,
  });
});

export function mediaKindFromAniListFormat(format: string | undefined): MediaKind {
  if (format === "NOVEL") {
    return "light_novel";
  }

  if (format === "MANGA" || format === "ONE_SHOT") {
    return "manga";
  }

  return "anime";
}
