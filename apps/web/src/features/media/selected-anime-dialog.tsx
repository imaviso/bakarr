import { lazy } from "react";
import { useQuery } from "@tanstack/react-query";
import { mediaByAnilistIdQueryOptions } from "@/api/media";
import { errorMessage } from "@/api/effect/errors";
import type { MediaIdSpace, MediaKind } from "@/api/contracts";
import {
  ContentDialog,
  ContentDialogBody,
  ContentDialogHeader,
} from "@/components/shared/content-dialog";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

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
  const query = useQuery(mediaByAnilistIdQueryOptions(anilistId, mediaKind, idSpace));

  if (query.isPending) {
    return (
      <ContentDialog size="lg" isOpen onOpenChange={(open) => !open && onOpenChange()}>
        <ContentDialogHeader>
          <DialogTitle>Loading details</DialogTitle>
        </ContentDialogHeader>
        <ContentDialogBody className="flex items-center justify-center p-8">
          <Spinner className="h-6 w-6 text-muted-foreground" />
        </ContentDialogBody>
      </ContentDialog>
    );
  }

  if (query.isError) {
    return (
      <ContentDialog size="lg" isOpen onOpenChange={(open) => !open && onOpenChange()}>
        <ContentDialogHeader>
          <DialogTitle>Failed to load details</DialogTitle>
          <DialogDescription>
            {errorMessage(query.error, "Failed to load details")}
          </DialogDescription>
        </ContentDialogHeader>
        <ContentDialogBody className="flex items-center justify-end gap-2 p-4">
          <Button variant="ghost" onPress={onOpenChange}>
            Close
          </Button>
          <Button variant="outline" onPress={() => void query.refetch()}>
            Retry
          </Button>
        </ContentDialogBody>
      </ContentDialog>
    );
  }

  return (
    <AddAnimeDialogLazy
      media={query.data}
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
