import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createMemo, Show } from "solid-js";
import * as v from "valibot";
import { AnimeError } from "~/components/anime-error";
import { AnimeDetailsDialogs } from "~/components/anime/anime-details-dialogs";
import { AnimeDetailsHeader } from "~/components/anime/anime-details-header";
import { AnimeDetailsMeta } from "~/components/anime/anime-details-meta";
import { AnimeDetailsSidebar } from "~/components/anime/anime-details-sidebar";
import { AnimeEpisodesPanel } from "~/components/anime/anime-episodes-panel";
import { AnimeDiscoverySection } from "~/components/anime-discovery";
import { useAnimeDetailsActions } from "~/hooks/use-anime-details-actions";
import { useAnimeDetailsDialogState } from "~/hooks/use-anime-details-dialog-state";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  animeDetailsQueryOptions,
  episodesQueryOptions,
  profilesQueryOptions,
  releaseProfilesQueryOptions,
} from "~/lib/api";

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
      queryClient.ensureQueryData(profilesQueryOptions()),
      queryClient.ensureQueryData(releaseProfilesQueryOptions()),
    ]);
  },
  component: AnimeDetailsPage,
  errorComponent: AnimeError,
});

function isAired(airedDate?: string) {
  if (!airedDate) return false;
  const aired = new Date(airedDate);
  const now = new Date();
  return aired <= now;
}

function AnimeDetailsPage() {
  const params = Route.useParams();
  const animeId = () => v.parse(IdParamSchema, params().id);
  const navigate = useNavigate();

  const animeQuery = useQuery(() => animeDetailsQueryOptions(animeId()));
  const episodesQuery = useQuery(() => episodesQueryOptions(animeId()));
  const profilesQuery = useQuery(profilesQueryOptions);
  const releaseProfilesQuery = useQuery(releaseProfilesQueryOptions);
  const actions = useAnimeDetailsActions({ animeId });
  const dialogState = useAnimeDetailsDialogState();

  const episodesData = createMemo(() => episodesQuery.data ?? []);
  const missingCount = createMemo(
    () => episodesData().filter((e) => !e.downloaded && isAired(e.aired)).length,
  );
  const availableCount = createMemo(() => episodesData().filter((e) => e.downloaded).length);
  const totalEpisodes = createMemo(
    () => episodesData().length || animeQuery.data?.episode_count || 0,
  );
  const isMonitored = () => animeQuery.data?.monitored ?? true;
  const libraryIds = createMemo(() => new Set(animeQuery.data ? [animeQuery.data.id] : []));

  const handleDeleteEpisodeFile = () => {
    actions.handleDeleteEpisodeFile(dialogState.deleteEpisodeState().episodeNumber);
    dialogState.setDeleteEpisodeState((prev) => ({ ...prev, open: false }));
  };

  return (
    <div class="space-y-6">
      <Show when={animeQuery.data}>
        {(anime) => (
          <>
            <AnimeDetailsHeader
              anime={anime()}
              animeId={animeId()}
              isMonitored={isMonitored()}
              missingCount={missingCount()}
              isRefreshPending={actions.isRefreshPending()}
              isSearchMissingPending={actions.isSearchMissingPending()}
              isToggleMonitorPending={actions.isToggleMonitorPending()}
              onToggleMonitor={() => actions.handleToggleMonitor(isMonitored())}
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
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <AnimeDetailsSidebar anime={anime()} />

              {/* Details */}
              <div class="lg:col-span-3 space-y-6">
                {/* Synopsis */}
                <Show when={anime().description}>
                  <Card>
                    <CardHeader class="pb-3">
                      <CardTitle class="text-base">Synopsis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p class="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                        {anime().description}
                      </p>
                    </CardContent>
                  </Card>
                </Show>

                <AnimeDetailsMeta
                  totalEpisodes={totalEpisodes()}
                  downloadedEpisodes={availableCount()}
                  missingEpisodes={missingCount()}
                  profileName={anime().profile_name}
                  rootFolder={anime().root_folder}
                  addedAt={anime().added_at}
                  onEditProfile={() => dialogState.setEditProfileOpen(true)}
                  onEditPath={() => dialogState.setEditPathOpen(true)}
                />

                <AnimeEpisodesPanel
                  episodes={episodesData()}
                  onRefreshMetadata={actions.handleRefreshEpisodes}
                  onOpenSearchModal={dialogState.setSearchModalState}
                  onOpenMappingDialog={dialogState.setMappingDialogState}
                  onOpenDeleteDialog={dialogState.setDeleteEpisodeState}
                  onPlayInMpv={actions.handlePlayInMpv}
                  onCopyStreamLink={actions.handleCopyStreamLink}
                />

                <AnimeDiscoverySection anime={anime()} libraryIds={libraryIds()} />
              </div>
            </div>
          </>
        )}
      </Show>

      <AnimeDetailsDialogs
        animeId={animeId()}
        searchModalState={dialogState.searchModalState()}
        onSearchModalOpenChange={(open) =>
          dialogState.setSearchModalState((prev) => ({ ...prev, open }))
        }
        renameDialogOpen={dialogState.renameDialogOpen()}
        onRenameDialogOpenChange={dialogState.setRenameDialogOpen}
        mappingDialogState={dialogState.mappingDialogState()}
        onMappingDialogOpenChange={(open) =>
          dialogState.setMappingDialogState((prev) => ({ ...prev, open }))
        }
        bulkMappingOpen={dialogState.bulkMappingOpen()}
        onBulkMappingOpenChange={dialogState.setBulkMappingOpen}
        deleteEpisodeState={dialogState.deleteEpisodeState()}
        onDeleteEpisodeDialogOpenChange={(open) =>
          dialogState.setDeleteEpisodeState((prev) => ({ ...prev, open }))
        }
        onConfirmDeleteEpisode={handleDeleteEpisodeFile}
        editPathOpen={dialogState.editPathOpen()}
        onEditPathOpenChange={dialogState.setEditPathOpen}
        currentPath={animeQuery.data?.root_folder || ""}
        updatePath={actions.updatePath}
        isUpdatingPath={actions.isUpdatingPath()}
        editProfileOpen={dialogState.editProfileOpen()}
        onEditProfileOpenChange={dialogState.setEditProfileOpen}
        currentProfile={animeQuery.data?.profile_name || ""}
        currentReleaseProfileIds={animeQuery.data?.release_profile_ids || []}
        updateProfile={actions.updateProfile}
        isUpdatingProfile={actions.isUpdatingProfile()}
        updateReleaseProfiles={actions.updateReleaseProfiles}
        isUpdatingReleaseProfiles={actions.isUpdatingReleaseProfiles()}
        profiles={profilesQuery.data || []}
        releaseProfiles={releaseProfilesQuery.data || []}
      />
    </div>
  );
}
