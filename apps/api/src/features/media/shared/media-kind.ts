import type { MediaKind } from "@packages/shared/index.ts";

export function decodeMediaKind(value: string): MediaKind {
  switch (value) {
    case "anime":
    case "manga":
    case "light_novel":
      return value;
    default:
      throw new Error(`Invalid media kind: ${value}`);
  }
}

export function mediaKindFromAniListFormat(format: string | undefined): MediaKind {
  if (format === "NOVEL") {
    return "light_novel";
  }

  if (format === "MANGA" || format === "ONE_SHOT") {
    return "manga";
  }

  return "anime";
}
