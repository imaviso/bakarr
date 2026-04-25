import { SearchModal } from "~/features/search/search-modal";
import { RenameDialog } from "~/features/downloads/rename-dialog";
import { BulkMappingDialog, ManualMappingDialog } from "~/features/anime/mapping-dialogs";
import { EditPathDialog } from "~/features/anime/edit-path-dialog";
import { EditProfileDialog } from "~/features/anime/edit-profile-dialog";
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
import { useAnimeDetailsDialogs } from "~/features/anime/anime-details-dialogs-context";

export function AnimeDetailsDialogs() {
  const ctx = useAnimeDetailsDialogs();

  return (
    <>
      <SearchModal
        animeId={ctx.animeId}
        episodeNumber={ctx.searchModalState.episodeNumber}
        {...(ctx.searchModalState.episodeTitle === undefined
          ? {}
          : { episodeTitle: ctx.searchModalState.episodeTitle })}
        open={ctx.searchModalState.open}
        onOpenChange={ctx.onSearchModalOpenChange}
      />

      <RenameDialog
        animeId={ctx.animeId}
        open={ctx.renameDialogOpen}
        onOpenChange={ctx.onRenameDialogOpenChange}
      />

      <ManualMappingDialog
        animeId={ctx.animeId}
        episodeNumber={ctx.mappingDialogState.episodeNumber}
        open={ctx.mappingDialogState.open}
        onOpenChange={ctx.onMappingDialogOpenChange}
      />

      <BulkMappingDialog
        animeId={ctx.animeId}
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
              Delete Episode {ctx.deleteEpisodeState.episodeNumber}?
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
        animeId={ctx.animeId}
        updatePath={ctx.updatePath}
        isPending={ctx.isUpdatingPath}
      />

      <EditProfileDialog
        open={ctx.editProfileOpen}
        onOpenChange={ctx.onEditProfileOpenChange}
        currentProfile={ctx.currentProfile}
        currentReleaseProfileIds={ctx.currentReleaseProfileIds}
        animeId={ctx.animeId}
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
