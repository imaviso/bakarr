import { useCallback, useMemo, Suspense, lazy } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import { AnimeDetailsHeader } from "~/features/media/media-details-header";
import { AnimeDetailsMeta } from "~/features/media/media-details-meta";
import { AnimeDetailsSidebar } from "~/features/media/media-details-sidebar";
import { AnimeEpisodesPanel } from "~/features/media/media-units-panel";
import { AnimeDiscoverySection } from "~/features/media/media-discovery";
import { AnimeError } from "~/features/media/media-error";
import { AnimeDetailsDialogsProvider } from "~/features/media/media-details-dialogs-context";
import { useAnimeDetailsActions } from "~/features/media/hooks/use-media-details-actions";
import { useAnimeDetailsDialogState } from "~/features/media/hooks/use-media-details-dialog-state";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { PageShell } from "~/app/layout/page-shell";
import { mediaDetailsQueryOptions, mediaListQueryOptions, unitsQueryOptions } from "~/api/media";
import { useAnimeScanTaskQuery, isTaskActive } from "~/api/operations-tasks";
import { profilesQueryOptions, releaseProfilesQueryOptions } from "~/api/profiles";
import { usePageTitle } from "~/domain/page-title";
import { isAired } from "~/domain/date-time";

const AnimeDetailsDialogsLazy = lazy(() =>
  import("~/features/media/media-details-dialogs").then((module) => ({
    default: module.AnimeDetailsDialogs,
  })),
);

const IdParamSchema = Schema.NumberFromString.pipe(Schema.int());

export const Route = createFileRoute("/_layout/media/$id")({
  loader: async ({ context: { queryClient }, params }) => {
    const mediaId = Schema.decodeUnknownSync(IdParamSchema)(params.id);
    await Promise.all([
      queryClient.ensureQueryData(mediaDetailsQueryOptions(mediaId)),
      queryClient.ensureQueryData(unitsQueryOptions(mediaId)),
      queryClient.ensureQueryData(mediaListQueryOptions()),
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(releaseProfilesQueryOptions()),
    ]);
    return { mediaId };
  },
  component: AnimeDetailsPage,
  errorComponent: AnimeError,
});

function AnimeDetailsPage() {
  const { mediaId } = Route.useLoaderData();
  const navigate = useNavigate();

  const animeQuery = useSuspenseQuery(mediaDetailsQueryOptions(mediaId));
  const media = animeQuery.data;
  usePageTitle(media.title.english || media.title.romaji);

  const episodesQuery = useSuspenseQuery(unitsQueryOptions(mediaId));
  const animeList = useSuspenseQuery(mediaListQueryOptions()).data;
  const profilesQuery = useSuspenseQuery(profilesQueryOptions());
  const releaseProfilesQuery = useSuspenseQuery(releaseProfilesQueryOptions());

  const actions = useAnimeDetailsActions({ mediaId });
  const dialogState = useAnimeDetailsDialogState();
  const { setBulkMappingOpen, setEditPathOpen, setEditProfileOpen, setRenameDialogOpen } =
    dialogState;

  const scanTaskQuery = useAnimeScanTaskQuery({
    mediaId,
    ...(actions.latestScanTaskId === undefined ? {} : { taskId: actions.latestScanTaskId }),
  });
  const isScanTaskRunning = useMemo(
    () => scanTaskQuery.data !== undefined && isTaskActive(scanTaskQuery.data),
    [scanTaskQuery.data],
  );

  const episodesData = episodesQuery.data;

  const missingCount = useMemo(
    () => episodesData.filter((e) => !e.downloaded && isAired(e.aired)).length,
    [episodesData],
  );
  const availableCount = useMemo(
    () => episodesData.filter((e) => e.downloaded).length,
    [episodesData],
  );
  const totalUnits = episodesData.length || media.unit_count || 0;
  const isMonitored = media.monitored ?? true;

  const libraryIds = useMemo(() => new Set(animeList.map((a) => a.id)), [animeList]);

  const handleDeleteEpisodeFile = useCallback(() => {
    actions.handleDeleteEpisodeFile(dialogState.deleteEpisodeState.unitNumber);
    dialogState.setDeleteEpisodeState((prev) => ({ ...prev, open: false }));
  }, [actions, dialogState]);

  const handleToggleMonitor = useCallback(
    () => actions.handleToggleMonitor(isMonitored),
    [actions, isMonitored],
  );

  const handleDeleteAnime = useCallback(() => {
    actions.handleDeleteAnime(() => {
      void navigate({
        to: "/media",
        search: { q: "", filter: "all", view: "grid" },
      });
    });
  }, [actions, navigate]);

  const handleRenameFiles = useCallback(() => setRenameDialogOpen(true), [setRenameDialogOpen]);

  const handleOpenBulkMapping = useCallback(() => setBulkMappingOpen(true), [setBulkMappingOpen]);

  const handleEditProfile = useCallback(() => setEditProfileOpen(true), [setEditProfileOpen]);

  const handleEditPath = useCallback(() => setEditPathOpen(true), [setEditPathOpen]);

  const animeInfo = useMemo(
    () => ({
      currentPath: media.root_folder || "",
      currentProfile: media.profile_name || "",
      currentReleaseProfileIds: media.release_profile_ids || [],
    }),
    [media.root_folder, media.profile_name, media.release_profile_ids],
  );

  const dialogFlags = useMemo(
    () => ({
      searchModalState: dialogState.searchModalState,
      renameDialogOpen: dialogState.renameDialogOpen,
      mappingDialogState: dialogState.mappingDialogState,
      bulkMappingOpen: dialogState.bulkMappingOpen,
      deleteEpisodeState: dialogState.deleteEpisodeState,
      editPathOpen: dialogState.editPathOpen,
      editProfileOpen: dialogState.editProfileOpen,
    }),
    [dialogState],
  );

  const profileData = useMemo(
    () => ({
      profiles: profilesQuery.data,
      releaseProfiles: releaseProfilesQuery.data,
    }),
    [profilesQuery.data, releaseProfilesQuery.data],
  );

  const updateLoading = useMemo(
    () => ({
      isUpdatingPath: actions.isUpdatingPath,
      isUpdatingProfile: actions.isUpdatingProfile,
      isUpdatingReleaseProfiles: actions.isUpdatingReleaseProfiles,
    }),
    [actions.isUpdatingPath, actions.isUpdatingProfile, actions.isUpdatingReleaseProfiles],
  );

  const dialogsState = useMemo(
    () => ({
      mediaId,
      episodes: episodesData,
      ...animeInfo,
      ...dialogFlags,
      ...profileData,
      ...updateLoading,
    }),
    [mediaId, episodesData, animeInfo, dialogFlags, profileData, updateLoading],
  );

  const dialogsDispatch = useMemo(
    () => ({
      onSearchModalOpenChange: (open: boolean) =>
        dialogState.setSearchModalState((prev) => ({ ...prev, open })),
      onRenameDialogOpenChange: dialogState.setRenameDialogOpen,
      onMappingDialogOpenChange: (open: boolean) =>
        dialogState.setMappingDialogState((prev) => ({ ...prev, open })),
      onBulkMappingOpenChange: dialogState.setBulkMappingOpen,
      onDeleteEpisodeDialogOpenChange: (open: boolean) =>
        dialogState.setDeleteEpisodeState((prev) => ({ ...prev, open })),
      onConfirmDeleteEpisode: handleDeleteEpisodeFile,
      onEditPathOpenChange: dialogState.setEditPathOpen,
      updatePath: actions.updatePath,
      onEditProfileOpenChange: dialogState.setEditProfileOpen,
      updateProfile: actions.updateProfile,
      updateReleaseProfiles: actions.updateReleaseProfiles,
    }),
    [
      dialogState,
      handleDeleteEpisodeFile,
      actions.updatePath,
      actions.updateProfile,
      actions.updateReleaseProfiles,
    ],
  );

  return (
    <AnimeDetailsDialogsProvider value={{ ...dialogsState, ...dialogsDispatch }}>
      <PageShell>
        <AnimeDetailsHeader
          media={media}
          mediaId={mediaId}
          isMonitored={isMonitored}
          missingCount={missingCount}
          isRefreshPending={actions.isRefreshPending}
          isScanFolderPending={actions.isScanFolderPending || isScanTaskRunning}
          isSearchMissingPending={actions.isSearchMissingPending}
          isToggleMonitorPending={actions.isToggleMonitorPending}
          onToggleMonitor={handleToggleMonitor}
          onRefreshEpisodes={actions.handleRefreshEpisodes}
          onSearchMissing={actions.handleSearchMissing}
          onScanFolder={actions.handleScanFolder}
          onRenameFiles={handleRenameFiles}
          onOpenBulkMapping={handleOpenBulkMapping}
          onDeleteAnime={handleDeleteAnime}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <AnimeDetailsSidebar media={media} />

          <div className="flex flex-col gap-6 lg:col-span-3">
            {media.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Synopsis</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                    {media.description}
                  </p>
                </CardContent>
              </Card>
            )}

            {media.background && (
              <Card>
                <CardHeader>
                  <CardTitle>Background</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                    {media.background}
                  </p>
                </CardContent>
              </Card>
            )}

            <AnimeDetailsMeta
              totalUnits={totalUnits}
              downloadedUnits={availableCount}
              missingUnits={missingCount}
              profileName={media.profile_name}
              rootFolder={media.root_folder}
              addedAt={media.added_at}
              onEditProfile={handleEditProfile}
              onEditPath={handleEditPath}
            />

            <AnimeEpisodesPanel
              episodes={episodesData}
              onRefreshMetadata={actions.handleRefreshEpisodes}
              onOpenSearchModal={dialogState.setSearchModalState}
              onOpenMappingDialog={dialogState.setMappingDialogState}
              onOpenDeleteDialog={dialogState.setDeleteEpisodeState}
              onPlayInMpv={actions.handlePlayInMpv}
              onCopyStreamLink={actions.handleCopyStreamLink}
            />

            <AnimeDiscoverySection media={media} libraryIds={libraryIds} />
          </div>
        </div>

        <Suspense fallback={null}>
          <AnimeDetailsDialogsLazy />
        </Suspense>
      </PageShell>
    </AnimeDetailsDialogsProvider>
  );
}
