import { lazy } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { mediaByAnilistIdQueryOptions } from "@/api/media";
import type { MediaIdSpace, MediaKind } from "@/api/contracts";

const AddAnimeDialogLazy = lazy(() =>
  import("@/features/media/add-media-dialog").then((module) => ({
    default: module.AddAnimeDialog,
  })),
);

export function SelectedAnimeDialog({
  anilistId,
  idSpace,
  mediaKind,
  onOpenChange,
  onSuccess,
}: {
  anilistId: number;
  idSpace?: MediaIdSpace | undefined;
  mediaKind: MediaKind;
  onOpenChange: () => void;
  onSuccess: () => void;
}) {
  const { data: anime } = useSuspenseQuery(
    mediaByAnilistIdQueryOptions(anilistId, mediaKind, idSpace),
  );
  return (
    <AddAnimeDialogLazy
      media={anime}
      open
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange();
        }
      }}
      onSuccess={onSuccess}
    />
  );
}
