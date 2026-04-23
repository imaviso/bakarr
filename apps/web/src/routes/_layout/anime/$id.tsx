import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import * as v from "valibot";
import { AnimeDetailsHeader } from "~/components/anime/anime-details-header";
import { AnimeDetailsMeta } from "~/components/anime/anime-details-meta";
import { AnimeDetailsSidebar } from "~/components/anime/anime-details-sidebar";
import { AnimeEpisodesPanel } from "~/components/anime/anime-episodes-panel";
import { AnimeDiscoverySection } from "~/components/anime-discovery";
import { AnimeError } from "~/components/anime-error";
import { useAnimeDetailsActions } from "~/hooks/use-anime-details-actions";
import { useAnimeDetailsDialogState } from "~/hooks/use-anime-details-dialog-state";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  createAnimeScanTaskQuery,
  animeDetailsQueryOptions,
  animeListQueryOptions,
  episodesQueryOptions,
  isTaskActive,
  profilesQueryOptions,
  releaseProfilesQueryOptions,
} from "~/lib/api";
import { usePageTitle } from "~/lib/page-title";
import { isAired } from "~/lib/date-time";

const AnimeDetailsDialogsLazy = lazy(() =>
  import("~/components/anime/anime-details-dialogs").then((module) => ({
    default: module.AnimeDetailsDialogs,
  })),
);

const IdParamSchema = v.pipe(
  v.string(),
  v.check((s) => !Number.isNaN(Number(s)), "ID must be a number"),
  v.transform(Number),
);

export const Route = createFileRoute("/_layout/anime/$id")({
  loader: async ({ context: { queryClient }, params }) => {
    const animeId = v.parse(IdParamSchema, params.id);
    await Promise.all([
      queryClient.ensureQueryData(animeDetailsQueryOptions(animeId)),
      queryClient.ensureQueryData(episodesQueryOptions(animeId)),
      queryClient.ensureQueryData(animeListQueryOptions()),
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(releaseProfilesQueryOptions()),
    ]);
  },
  component: AnimeDetailsPage,
  errorComponent: AnimeError,
});

function AnimeDetailsPage() {
  const params = Route.useParams();
  const animeId = v.parse(IdParamSchema, params.id);
  const navigate = useNavigate();

  const animeQuery = useSuspenseQuery(animeDetailsQueryOptions(animeId));
  const anime = animeQuery.data;
  usePageTitle(anime.title.english || anime.title.romaji);
  const episodesQuery = useSuspenseQuery(episodesQueryOptions(animeId));
  const animeList = useSuspenseQuery(animeListQueryOptions()).data;
  const profilesQuery = useSuspenseQuery(profilesQueryOptions());
  const releaseProfilesQuery = useSuspenseQuery(releaseProfilesQueryOptions());
  const actions = useAnimeDetailsActions({ animeId });
  const scanTaskQuery = createAnimeScanTaskQuery({
    animeId,
    ...(actions.latestScanTaskId === undefined ? {} : { taskId: actions.latestScanTaskId }),
  });
  const isScanTaskRunning = scanTaskQuery.data !== undefined && isTaskActive(scanTaskQuery.data);
  const dialogState = useAnimeDetailsDialogState();

  const episodesData = episodesQuery.data;
  const missingCount = episodesData.filter((e) => !e.downloaded && isAired(e.aired)).length;
  const availableCount = episodesData.filter((e) => e.downloaded).length;
  const totalEpisodes = episodesData.length || anime.episode_count || 0;
  const isMonitored = anime.monitored ?? true;
  const libraryIds = new Set(animeList.map((a) => a.id));

  const handleDeleteEpisodeFile = () => {
    actions.handleDeleteEpisodeFile(dialogState.deleteEpisodeState.episodeNumber);
    dialogState.setDeleteEpisodeState((prev) => ({ ...prev, open: false }));
  };

  return (
    <div className="space-y-6">
      <AnimeDetailsHeader
        anime={anime}
        animeId={animeId}
        isMonitored={isMonitored}
        missingCount={missingCount}
        isRefreshPending={actions.isRefreshPending}
        isScanFolderPending={actions.isScanFolderPending || isScanTaskRunning}
        isSearchMissingPending={actions.isSearchMissingPending}
        isToggleMonitorPending={actions.isToggleMonitorPending}
        onToggleMonitor={() => actions.handleToggleMonitor(isMonitored)}
        onRefreshEpisodes={actions.handleRefreshEpisodes}
        onSearchMissing={actions.handleSearchMissing}
        onScanFolder={actions.handleScanFolder}
        onRenameFiles={() => dialogState.setRenameDialogOpen(true)}
        onOpenBulkMapping={() => dialogState.setBulkMappingOpen(true)}
        onDeleteAnime={() => {
          actions.handleDeleteAnime(
            () =>
              void navigate({
                to: "/anime",
                search: { q: "", filter: "all", view: "grid" },
              }),
          );
        }}
      />

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <AnimeDetailsSidebar anime={anime} />

        {/* Details */}
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
            onEditProfile={() => dialogState.setEditProfileOpen(true)}
            onEditPath={() => dialogState.setEditPathOpen(true)}
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
        <AnimeDetailsDialogsLazy
          animeId={animeId}
          episodes={episodesData}
          searchModalState={dialogState.searchModalState}
          onSearchModalOpenChange={(open) =>
            dialogState.setSearchModalState((prev) => ({ ...prev, open }))
          }
          renameDialogOpen={dialogState.renameDialogOpen}
          onRenameDialogOpenChange={dialogState.setRenameDialogOpen}
          mappingDialogState={dialogState.mappingDialogState}
          onMappingDialogOpenChange={(open) =>
            dialogState.setMappingDialogState((prev) => ({ ...prev, open }))
          }
          bulkMappingOpen={dialogState.bulkMappingOpen}
          onBulkMappingOpenChange={dialogState.setBulkMappingOpen}
          deleteEpisodeState={dialogState.deleteEpisodeState}
          onDeleteEpisodeDialogOpenChange={(open) =>
            dialogState.setDeleteEpisodeState((prev) => ({ ...prev, open }))
          }
          onConfirmDeleteEpisode={handleDeleteEpisodeFile}
          editPathOpen={dialogState.editPathOpen}
          onEditPathOpenChange={dialogState.setEditPathOpen}
          currentPath={anime.root_folder || ""}
          updatePath={actions.updatePath}
          isUpdatingPath={actions.isUpdatingPath}
          editProfileOpen={dialogState.editProfileOpen}
          onEditProfileOpenChange={dialogState.setEditProfileOpen}
          currentProfile={anime.profile_name || ""}
          currentReleaseProfileIds={anime.release_profile_ids || []}
          updateProfile={actions.updateProfile}
          isUpdatingProfile={actions.isUpdatingProfile}
          updateReleaseProfiles={actions.updateReleaseProfiles}
          isUpdatingReleaseProfiles={actions.isUpdatingReleaseProfiles}
          profiles={profilesQuery.data}
          releaseProfiles={releaseProfilesQuery.data}
        />
      </Suspense>
    </div>
  );
}
