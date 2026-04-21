import { SearchModal } from "~/components/search-modal";
import { RenameDialog } from "~/components/rename-dialog";
import { BulkMappingDialog, ManualMappingDialog } from "~/components/anime/mapping-dialogs";
import { EditPathDialog } from "~/components/anime/edit-path-dialog";
import { EditProfileDialog } from "~/components/anime/edit-profile-dialog";
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
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "~/components/anime/anime-details-types";
import type { QualityProfile, ReleaseProfile } from "~/lib/api";

interface AnimeDetailsDialogsProps {
  animeId: number;
  searchModalState: AnimeSearchModalState;
  onSearchModalOpenChange: (open: boolean) => void;
  renameDialogOpen: boolean;
  onRenameDialogOpenChange: (open: boolean) => void;
  mappingDialogState: AnimeEpisodeDialogState;
  onMappingDialogOpenChange: (open: boolean) => void;
  bulkMappingOpen: boolean;
  onBulkMappingOpenChange: (open: boolean) => void;
  deleteEpisodeState: AnimeEpisodeDialogState;
  onDeleteEpisodeDialogOpenChange: (open: boolean) => void;
  onConfirmDeleteEpisode: () => void;
  editPathOpen: boolean;
  onEditPathOpenChange: (open: boolean) => void;
  currentPath: string;
  updatePath: (input: { id: number; path: string; rescan?: boolean }) => Promise<unknown>;
  isUpdatingPath: boolean;
  editProfileOpen: boolean;
  onEditProfileOpenChange: (open: boolean) => void;
  currentProfile: string;
  currentReleaseProfileIds: number[];
  updateProfile: (input: { id: number; profileName: string }) => Promise<unknown>;
  isUpdatingProfile: boolean;
  updateReleaseProfiles: (input: { id: number; releaseProfileIds: number[] }) => Promise<unknown>;
  isUpdatingReleaseProfiles: boolean;
  profiles: QualityProfile[];
  releaseProfiles: ReleaseProfile[];
}

export function AnimeDetailsDialogs(props: AnimeDetailsDialogsProps) {
  return (
    <>
      <SearchModal
        animeId={props.animeId}
        episodeNumber={props.searchModalState.episodeNumber}
        {...(props.searchModalState.episodeTitle === undefined
          ? {}
          : { episodeTitle: props.searchModalState.episodeTitle })}
        open={props.searchModalState.open}
        onOpenChange={props.onSearchModalOpenChange}
      />

      <RenameDialog
        animeId={props.animeId}
        open={props.renameDialogOpen}
        onOpenChange={props.onRenameDialogOpenChange}
      />

      <ManualMappingDialog
        animeId={props.animeId}
        episodeNumber={props.mappingDialogState.episodeNumber}
        open={props.mappingDialogState.open}
        onOpenChange={props.onMappingDialogOpenChange}
      />

      <BulkMappingDialog
        animeId={props.animeId}
        open={props.bulkMappingOpen}
        onOpenChange={props.onBulkMappingOpenChange}
      />

      <AlertDialog
        open={props.deleteEpisodeState.open}
        onOpenChange={props.onDeleteEpisodeDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete Episode {props.deleteEpisodeState.episodeNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the file from disk. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={props.onConfirmDeleteEpisode}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPathDialog
        open={props.editPathOpen}
        onOpenChange={props.onEditPathOpenChange}
        currentPath={props.currentPath}
        animeId={props.animeId}
        updatePath={props.updatePath}
        isPending={props.isUpdatingPath}
      />

      <EditProfileDialog
        open={props.editProfileOpen}
        onOpenChange={props.onEditProfileOpenChange}
        currentProfile={props.currentProfile}
        currentReleaseProfileIds={props.currentReleaseProfileIds}
        animeId={props.animeId}
        updateProfile={props.updateProfile}
        isUpdatingProfile={props.isUpdatingProfile}
        updateReleaseProfiles={props.updateReleaseProfiles}
        isUpdatingReleaseProfiles={props.isUpdatingReleaseProfiles}
        profiles={props.profiles}
        releaseProfiles={props.releaseProfiles}
      />
    </>
  );
}
