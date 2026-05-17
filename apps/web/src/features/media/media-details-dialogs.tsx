import { SearchModal } from "~/features/search/search-modal";
import { RenameDialog } from "~/features/downloads/rename-dialog";
import { BulkMappingDialog, ManualMappingDialog } from "~/features/media/mapping-dialogs";
import { EditPathDialog } from "~/features/media/edit-path-dialog";
import { EditProfileDialog } from "~/features/media/edit-profile-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { useAnimeDetailsDialogs } from "~/features/media/media-details-dialogs-context";
import { mediaUnitLabel } from "~/domain/media-unit";

export function AnimeDetailsDialogs() {
  const ctx = useAnimeDetailsDialogs();

  return (
    <>
      <SearchModal
        mediaId={ctx.mediaId}
        unitNumber={ctx.searchModalState.unitNumber}
        unitKind={ctx.searchModalState.unitKind}
        {...(ctx.searchModalState.unitTitle === undefined
          ? {}
          : { unitTitle: ctx.searchModalState.unitTitle })}
        open={ctx.searchModalState.open}
        onOpenChange={ctx.onSearchModalOpenChange}
      />

      <RenameDialog
        mediaId={ctx.mediaId}
        open={ctx.renameDialogOpen}
        onOpenChange={ctx.onRenameDialogOpenChange}
      />

      <ManualMappingDialog
        mediaId={ctx.mediaId}
        unitNumber={ctx.mappingDialogState.unitNumber}
        open={ctx.mappingDialogState.open}
        onOpenChange={ctx.onMappingDialogOpenChange}
      />

      <BulkMappingDialog
        mediaId={ctx.mediaId}
        episodes={ctx.episodes}
        open={ctx.bulkMappingOpen}
        onOpenChange={ctx.onBulkMappingOpenChange}
      />

      <AlertDialog
        open={ctx.deleteEpisodeState.open}
        onOpenChange={ctx.onDeleteEpisodeDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {mediaUnitLabel(ctx.deleteEpisodeState.unitKind)}{" "}
              {ctx.deleteEpisodeState.unitNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the file from disk. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={ctx.onConfirmDeleteEpisode}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPathDialog
        open={ctx.editPathOpen}
        onOpenChange={ctx.onEditPathOpenChange}
        currentPath={ctx.currentPath}
        mediaId={ctx.mediaId}
        updatePath={ctx.updatePath}
        isPending={ctx.isUpdatingPath}
      />

      <EditProfileDialog
        open={ctx.editProfileOpen}
        onOpenChange={ctx.onEditProfileOpenChange}
        currentProfile={ctx.currentProfile}
        currentReleaseProfileIds={ctx.currentReleaseProfileIds}
        mediaId={ctx.mediaId}
        updateProfile={ctx.updateProfile}
        isUpdatingProfile={ctx.isUpdatingProfile}
        updateReleaseProfiles={ctx.updateReleaseProfiles}
        isUpdatingReleaseProfiles={ctx.isUpdatingReleaseProfiles}
        profiles={ctx.profiles}
        releaseProfiles={ctx.releaseProfiles}
      />
    </>
  );
}
