import { lazy } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { mediaByAnilistIdQueryOptions } from "@/api/media";
import type { AddMediaSearch } from "@/routes/_layout/media/-add-search";

const AddAnimeDialogLazy = lazy(() =>
  import("@/features/media/add-media-dialog").then((module) => ({
    default: module.AddAnimeDialog,
  })),
);

export function SelectedAnimeDialog({
  anilistId,
  mediaKind,
  onOpenChange,
  onSuccess,
}: {
  anilistId: number;
  mediaKind: NonNullable<AddMediaSearch["media_kind"]>;
  onOpenChange: () => void;
  onSuccess: () => void;
}) {
  const { data: anime } = useSuspenseQuery(mediaByAnilistIdQueryOptions(anilistId, mediaKind));
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
