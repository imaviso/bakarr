import type { MediaKind, MediaUnitKind } from "~/api/contracts";

export function mediaUnitKindFromMediaKind(mediaKind: MediaKind): MediaUnitKind {
  return mediaKind === "anime" ? "episode" : "volume";
}

export function mediaKindLabel(mediaKind: MediaKind | undefined) {
  if (mediaKind === "manga") {
    return "manga";
  }

  if (mediaKind === "light_novel") {
    return "light novel";
  }

  return "anime";
}

export function mediaUnitLabel(unitKind: MediaUnitKind | undefined, count = 1) {
  const kind = unitKind ?? "episode";
  if (kind === "volume") {
    return count === 1 ? "Volume" : "Volumes";
  }

  return count === 1 ? "Episode" : "Episodes";
}

export function mediaUnitShortLabel(unitKind: MediaUnitKind | undefined, count: number) {
  return unitKind === "volume" ? `${count} vols` : `${count} eps`;
}
