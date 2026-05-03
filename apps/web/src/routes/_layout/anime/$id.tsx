import { useCallback, useMemo, Suspense, lazy } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import { AnimeDetailsHeader } from "~/features/anime/anime-details-header";
import { AnimeDetailsMeta } from "~/features/anime/anime-details-meta";
import { AnimeDetailsSidebar } from "~/features/anime/anime-details-sidebar";
import { AnimeEpisodesPanel } from "~/features/anime/anime-episodes-panel";
import { AnimeDiscoverySection } from "~/features/anime/anime-discovery";
import { AnimeError } from "~/features/anime/anime-error";
import { AnimeDetailsDialogsProvider } from "~/features/anime/anime-details-dialogs-context";
import { useAnimeDetailsActions } from "~/features/anime/hooks/use-anime-details-actions";
import { useAnimeDetailsDialogState } from "~/features/anime/hooks/use-anime-details-dialog-state";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { animeDetailsQueryOptions, animeListQueryOptions, episodesQueryOptions } from "~/api/anime";
import { useAnimeScanTaskQuery, isTaskActive } from "~/api/operations-tasks";
import { profilesQueryOptions, releaseProfilesQueryOptions } from "~/api/profiles";
import { usePageTitle } from "~/domain/page-title";
import { isAired } from "~/domain/date-time";

const AnimeDetailsDialogsLazy = lazy(() =>
  import("~/features/anime/anime-details-dialogs").then((module) => ({
    default: module.AnimeDetailsDialogs,
  })),
);

const IdParamSchema = Schema.NumberFromString.pipe(Schema.int());

export const Route = createFileRoute("/_layout/anime/$id")({
  loader: async ({ context: { queryClient }, params }) => {
    const animeId = Schema.decodeUnknownSync(IdParamSchema)(params.id);
    await Promise.all([
      queryClient.ensureQueryData(animeDetailsQueryOptions(animeId)),
      queryClient.ensureQueryData(episodesQueryOptions(animeId)),
      queryClient.ensureQueryData(animeListQueryOptions()),
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(releaseProfilesQueryOptions()),
    ]);
    return { animeId };
  },
  component: AnimeDetailsPage,
  errorComponent: AnimeError,
});

function AnimeDetailsPage() {
  const { animeId } = Route.useLoaderData();
  const navigate = useNavigate();

  const animeQuery = useSuspenseQuery(animeDetailsQueryOptions(animeId));
  const anime = animeQuery.data;
  usePageTitle(anime.title.english || anime.title.romaji);

  const episodesQuery = useSuspenseQuery(episodesQueryOptions(animeId));
  const animeList = useSuspenseQuery(animeListQueryOptions()).data;
  const profilesQuery = useSuspenseQuery(profilesQueryOptions());
  const releaseProfilesQuery = useSuspenseQuery(releaseProfilesQueryOptions());

  const actions = useAnimeDetailsActions({ animeId });
  const dialogState = useAnimeDetailsDialogState();
  const { setBulkMappingOpen, setEditPathOpen, setEditProfileOpen, setRenameDialogOpen } =
    dialogState;

  const scanTaskQuery = useAnimeScanTaskQuery({
    animeId,
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
  const totalEpisodes = episodesData.length || anime.episode_count || 0;
  const isMonitored = anime.monitored ?? true;

  const libraryIds = useMemo(() => new Set(animeList.map((a) => a.id)), [animeList]);

  const handleDeleteEpisodeFile = useCallback(() => {
    actions.handleDeleteEpisodeFile(dialogState.deleteEpisodeState.episodeNumber);
    dialogState.setDeleteEpisodeState((prev) => ({ ...prev, open: false }));
  }, [actions, dialogState]);

  const handleToggleMonitor = useCallback(
    () => actions.handleToggleMonitor(isMonitored),
    [actions, isMonitored],
  );

  const handleDeleteAnime = useCallback(() => {
    actions.handleDeleteAnime(() => {
      void navigate({
        to: "/anime",
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
      currentPath: anime.root_folder || "",
      currentProfile: anime.profile_name || "",
      currentReleaseProfileIds: anime.release_profile_ids || [],
    }),
    [anime.root_folder, anime.profile_name, anime.release_profile_ids],
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
      animeId,
      episodes: episodesData,
      ...animeInfo,
      ...dialogFlags,
      ...profileData,
      ...updateLoading,
    }),
    [animeId, episodesData, animeInfo, dialogFlags, profileData, updateLoading],
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
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-6">
        <AnimeDetailsHeader
          anime={anime}
          animeId={animeId}
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

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <AnimeDetailsSidebar anime={anime} />

          <div className="lg:col-span-3 space-y-6">
            {anime.description && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Synopsis</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                    {anime.description}
                  </p>
                </CardContent>
              </Card>
            )}

            {anime.background && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Background</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                    {anime.background}
                  </p>
                </CardContent>
              </Card>
            )}

            <AnimeDetailsMeta
              totalEpisodes={totalEpisodes}
              downloadedEpisodes={availableCount}
              missingEpisodes={missingCount}
              profileName={anime.profile_name}
              rootFolder={anime.root_folder}
              addedAt={anime.added_at}
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

            <AnimeDiscoverySection anime={anime} libraryIds={libraryIds} />
          </div>
        </div>

        <Suspense fallback={null}>
          <AnimeDetailsDialogsLazy />
        </Suspense>
      </div>
    </AnimeDetailsDialogsProvider>
  );
}
