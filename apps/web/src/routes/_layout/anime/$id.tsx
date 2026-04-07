import {
  IconActivity,
  IconArrowLeft,
  IconBan,
  IconBookmark,
  IconBroadcast,
  IconCalendar,
  IconCircleCheck,
  IconCopy,
  IconDots,
  IconDownload,
  IconFileImport,
  IconFolderSearch,
  IconLayoutGrid,
  IconLink,
  IconList,
  IconPencil,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconTypography,
  IconX,
} from "@tabler/icons-solidjs";
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show, Suspense } from "solid-js";
import { toast } from "solid-sonner";
import * as v from "valibot";
import { AnimeError } from "~/components/anime-error";
import { EditPathDialog } from "~/components/anime/edit-path-dialog";
import { EditProfileDialog } from "~/components/anime/edit-profile-dialog";
import { BulkMappingDialog, ManualMappingDialog } from "~/components/anime/mapping-dialogs";
import { AnimeDiscoverySection } from "~/components/anime-discovery";
import { ImportDialog } from "~/components/import-dialog";
import { RenameDialog } from "~/components/rename-dialog";
import { SearchDialog } from "~/components/search-dialog";
import { SearchModal } from "~/components/search-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  animeDetailsQueryOptions,
  createDeleteAnimeMutation,
  createDeleteEpisodeFileMutation,
  createRefreshEpisodesMutation,
  createScanFolderMutation,
  createSearchMissingMutation,
  createToggleMonitorMutation,
  createUpdateAnimePathMutation,
  createUpdateAnimeProfileMutation,
  createUpdateAnimeReleaseProfilesMutation,
  episodesQueryOptions,
  getAnimeEpisodeStreamUrl,
  profilesQueryOptions,
  releaseProfilesQueryOptions,
} from "~/lib/api";
import { cn, copyToClipboard } from "~/lib/utils";
import { formatDurationSeconds } from "~/lib/scanned-file";

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

  const deleteAnime = createDeleteAnimeMutation();
  const refreshEpisodes = createRefreshEpisodesMutation();
  const scanFolder = createScanFolderMutation();
  const searchMissing = createSearchMissingMutation();
  const toggleMonitor = createToggleMonitorMutation();
  const deleteEpisodeFile = createDeleteEpisodeFileMutation();
  const updatePath = createUpdateAnimePathMutation();
  const updateProfile = createUpdateAnimeProfileMutation();
  const updateReleaseProfiles = createUpdateAnimeReleaseProfilesMutation();

  const [renameDialogOpen, setRenameDialogOpen] = createSignal(false);
  const [editPathOpen, setEditPathOpen] = createSignal(false);
  const [editProfileOpen, setEditProfileOpen] = createSignal(false);
  const [searchModalState, setSearchModalState] = createSignal<{
    open: boolean;
    episodeNumber: number;
    episodeTitle?: string;
  }>({
    open: false,
    episodeNumber: 1,
  });
  const [deleteEpisodeState, setDeleteEpisodeState] = createSignal<{
    open: boolean;
    episodeNumber: number;
  }>({
    open: false,
    episodeNumber: 0,
  });
  const [mappingDialogState, setMappingDialogState] = createSignal<{
    open: boolean;
    episodeNumber: number;
  }>({
    open: false,
    episodeNumber: 0,
  });
  const [bulkMappingOpen, setBulkMappingOpen] = createSignal(false);

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

  const handlePlayInMpv = async (episodeNumber: number) => {
    try {
      const { url } = await getAnimeEpisodeStreamUrl(animeId(), episodeNumber);
      const origin = globalThis.location.origin;
      globalThis.open(`mpv://${origin}${url}`, "_self");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not generate stream link.";
      toast.error(message);
    }
  };

  const handleCopyStreamLink = async (episodeNumber: number) => {
    try {
      const { url } = await getAnimeEpisodeStreamUrl(animeId(), episodeNumber);
      const origin = globalThis.location.origin;
      await copyToClipboard(`${origin}${url}`, "Stream URL");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not copy stream link.";
      toast.error(message);
    }
  };

  return (
    <div class="space-y-6">
      <Show when={animeQuery.data}>
        {(anime) => (
          <>
            {/* Banner */}
            <Show when={anime().banner_image}>
              <div class="w-full h-48 md:h-64 overflow-hidden rounded-none relative border-b border-border">
                <img
                  src={anime().banner_image}
                  alt={`${anime().title.english || anime().title.romaji} banner`}
                  loading="lazy"
                  class="w-full h-full object-cover"
                />
                <div class="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              </div>
            </Show>

            {/* Header */}
            <div class="flex flex-col md:flex-row md:items-center gap-4 relative">
              <div class="flex items-center gap-4 flex-1 min-w-0">
                <Link
                  to="/anime"
                  search={{ q: "", filter: "all", view: "grid" }}
                  class={buttonVariants({
                    variant: "ghost",
                    size: "icon",
                    class: "shrink-0",
                  })}
                >
                  <IconArrowLeft class="h-4 w-4" />
                </Link>
                <div class="flex-1 min-w-0">
                  <h1 class="text-xl font-semibold tracking-tight overflow-hidden flex items-center gap-3 min-w-0">
                    <span
                      class="truncate min-w-0 flex-1"
                      title={anime().title.english || anime().title.romaji}
                    >
                      {anime().title.english || anime().title.romaji}
                    </span>
                  </h1>
                  <div class="flex items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary" class="text-xs">
                      {anime().format}
                    </Badge>
                    <Tooltip>
                      <TooltipTrigger aria-label={anime().status}>
                        <Show when={anime().status === "RELEASING"}>
                          <IconBroadcast class="w-4 h-4 text-success" />
                        </Show>
                        <Show when={anime().status === "FINISHED"}>
                          <IconCircleCheck class="w-4 h-4 text-info" />
                        </Show>
                        <Show when={anime().status === "NOT_YET_RELEASED"}>
                          <IconCalendar class="w-4 h-4 text-warning" />
                        </Show>
                        <Show when={anime().status === "CANCELLED"}>
                          <IconBan class="w-4 h-4 text-error" />
                        </Show>
                        <Show
                          when={
                            !["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED"].includes(
                              anime().status,
                            )
                          }
                        >
                          <IconActivity class="w-4 h-4 text-muted-foreground" />
                        </Show>
                      </TooltipTrigger>
                      <TooltipContent>{anime().status}</TooltipContent>
                    </Tooltip>
                    <Show when={anime().title.native}>
                      <span>•</span>
                      <span class="font-japanese opacity-75">{anime().title.native}</span>
                    </Show>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 overflow-x-auto pb-2 -mb-2 no-scrollbar md:overflow-visible md:pb-0 md:mb-0">
                <Tooltip>
                  <TooltipTrigger
                    as={Button}
                    variant={isMonitored() ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      toggleMonitor.mutate({
                        id: animeId(),
                        monitored: !isMonitored(),
                      })
                    }
                    disabled={toggleMonitor.isPending}
                    class={cn("shrink-0", !isMonitored() && "text-muted-foreground bg-muted/50")}
                  >
                    <IconBookmark class={cn("h-4 w-4", isMonitored() && "fill-current")} />
                  </TooltipTrigger>
                  <TooltipContent>
                    {isMonitored() ? "Unmonitor Anime" : "Monitor Anime"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    as={Button}
                    variant="outline"
                    size="sm"
                    onClick={() => refreshEpisodes.mutate(animeId())}
                    disabled={refreshEpisodes.isPending}
                    class="shrink-0"
                  >
                    <IconRefresh
                      class={cn(
                        "min-[1670px]:mr-2 h-4 w-4",
                        refreshEpisodes.isPending && "animate-spin",
                      )}
                    />
                    <span class="hidden min-[1670px]:inline">Refresh</span>
                  </TooltipTrigger>
                  <TooltipContent>Refresh Metadata</TooltipContent>
                </Tooltip>

                <SearchDialog
                  animeId={animeId()}
                  defaultQuery={anime().title.romaji}
                  tooltip="Search Releases"
                  trigger={
                    <Button variant="outline" size="sm" class="shrink-0">
                      <IconDownload class="min-[1670px]:mr-2 h-4 w-4" />
                      <span class="hidden min-[1670px]:inline">Search</span>
                    </Button>
                  }
                />

                <Tooltip>
                  <TooltipTrigger
                    as={Button}
                    variant="outline"
                    size="sm"
                    onClick={() => searchMissing.mutate(animeId())}
                    disabled={searchMissing.isPending || !isMonitored() || missingCount() === 0}
                    class="shrink-0"
                  >
                    <IconSearch class="min-[1670px]:mr-2 h-4 w-4" />
                    <span class="hidden min-[1670px]:inline">Search Missing</span>
                  </TooltipTrigger>
                  <TooltipContent>Search Missing Episodes</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    as={Button}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      toast.promise(scanFolder.mutateAsync(animeId()), {
                        loading: "Scanning folder...",
                        success: (data) => `Scan complete. Found ${data.found} new episodes.`,
                        error: (err) => `Scan failed: ${err.message}`,
                      })
                    }
                    class="shrink-0"
                  >
                    <IconFileImport class="min-[1670px]:mr-2 h-4 w-4" />
                    <span class="hidden min-[1670px]:inline">Scan Folder</span>
                  </TooltipTrigger>
                  <TooltipContent>Scan Folder</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger
                    as={Button}
                    variant="outline"
                    size="sm"
                    onClick={() => setRenameDialogOpen(true)}
                    class="shrink-0"
                  >
                    <IconTypography class="min-[1670px]:mr-2 h-4 w-4" />
                    <span class="hidden min-[1670px]:inline">Rename</span>
                  </TooltipTrigger>
                  <TooltipContent>Rename Files</TooltipContent>
                </Tooltip>

                <ImportDialog
                  animeId={animeId()}
                  tooltip="Import Files"
                  trigger={
                    <Button variant="outline" size="sm" class="shrink-0">
                      <IconFolderSearch class="min-[1670px]:mr-2 h-4 w-4" />
                      <span class="hidden min-[1670px]:inline">Import</span>
                    </Button>
                  }
                />

                <Tooltip>
                  <TooltipTrigger
                    as={Button}
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkMappingOpen(true)}
                    class="shrink-0"
                  >
                    <IconLink class="min-[1670px]:mr-2 h-4 w-4" />
                    <span class="hidden min-[1670px]:inline">Map Episodes</span>
                  </TooltipTrigger>
                  <TooltipContent>Manual Map Episodes</TooltipContent>
                </Tooltip>

                <Link
                  to="/logs"
                  search={{
                    download_anime_id: String(animeId()),
                    download_cursor: "",
                    download_direction: "next",
                    download_download_id: "",
                    download_end_date: "",
                    download_event_type: "all",
                    download_start_date: "",
                    download_status: "",
                  }}
                  class="shrink-0"
                >
                  <Button variant="outline" size="sm">
                    <IconList class="min-[1670px]:mr-2 h-4 w-4" />
                    <span class="hidden min-[1670px]:inline">Events</span>
                  </Button>
                </Link>

                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger
                      as={AlertDialogTrigger}
                      variant="ghost"
                      size="icon"
                      class="text-muted-foreground hover:text-destructive shrink-0 h-9 w-9"
                    >
                      <IconTrash class="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>Delete Anime</TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Anime?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove "{anime().title.english || anime().title.romaji}" from your
                        library. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          deleteAnime.mutate(animeId(), {
                            onSuccess: () =>
                              void navigate({
                                to: "/anime",
                                search: { q: "", filter: "all", view: "grid" },
                              }),
                          });
                        }}
                        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Content */}
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Cover */}
              <div class="space-y-4">
                <Card class="overflow-hidden">
                  <Show
                    when={anime().cover_image}
                    fallback={
                      <div class="w-full aspect-[2/3] bg-muted flex items-center justify-center">
                        <IconPlayerPlay class="h-16 w-16 text-muted-foreground/30" />
                      </div>
                    }
                  >
                    <img
                      src={anime().cover_image}
                      alt={anime().title.english || anime().title.romaji}
                      loading="lazy"
                      class="w-full aspect-[2/3] object-cover"
                    />
                  </Show>
                </Card>

                <Show when={anime().score}>
                  <Card>
                    <CardContent class="p-3 flex items-center justify-between">
                      <span class="text-sm font-medium">Score</span>
                      <span class="font-bold text-lg">{anime().score}</span>
                    </CardContent>
                  </Card>
                </Show>

                <Show when={anime().studios && (anime().studios?.length ?? 0) > 0}>
                  <div class="space-y-1.5">
                    <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Studios
                    </h2>
                    <div class="flex flex-wrap gap-1">
                      <For each={anime().studios}>
                        {(studio) => (
                          <Badge variant="outline" class="text-xs">
                            {studio}
                          </Badge>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                <Show when={anime().genres && (anime().genres?.length ?? 0) > 0}>
                  <div class="space-y-1.5">
                    <h2 class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Genres
                    </h2>
                    <div class="flex flex-wrap gap-1">
                      <For each={anime().genres}>
                        {(genre) => (
                          <Badge variant="secondary" class="text-xs">
                            {genre}
                          </Badge>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>

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

                {/* Stats */}
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Card>
                    <CardContent class="p-4 text-center">
                      <p class="text-2xl font-bold">{totalEpisodes()}</p>
                      <p class="text-xs text-muted-foreground">Total</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent class="p-4 text-center">
                      <p class="text-2xl font-bold text-success">{availableCount()}</p>
                      <p class="text-xs text-muted-foreground">Downloaded</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent class="p-4 text-center">
                      <p class="text-2xl font-bold text-warning">{missingCount()}</p>
                      <p class="text-xs text-muted-foreground">Missing</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent class="p-4 text-center flex flex-col items-center justify-center h-full">
                      <Button
                        variant="ghost"
                        onClick={() => setEditProfileOpen(true)}
                        class="h-auto py-1.5 px-3 text-base font-bold gap-2 hover:bg-muted max-w-full"
                      >
                        <span class="truncate">{anime().profile_name}</span>
                        <IconPencil class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </Button>
                      <p class="text-xs text-muted-foreground mt-1">Profile</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Episodes */}
                <Suspense
                  fallback={
                    <div class="text-center py-8">
                      <p class="text-sm text-muted-foreground">Loading episodes...</p>
                    </div>
                  }
                >
                  <Tabs defaultValue="grid" class="w-full">
                    <Card>
                      <CardHeader class="pb-3 flex flex-row items-center justify-between space-y-0">
                        <CardTitle class="text-base">Episodes</CardTitle>
                        <TabsList>
                          <TabsTrigger value="grid">
                            <IconLayoutGrid class="h-4 w-4 mr-2" />
                            Grid
                          </TabsTrigger>
                          <TabsTrigger value="table">
                            <IconList class="h-4 w-4 mr-2" />
                            Table
                          </TabsTrigger>
                        </TabsList>
                      </CardHeader>
                      <CardContent>
                        <TabsContent value="grid">
                          <Show when={episodesData().length === 0}>
                            <div class="text-center py-8">
                              <p class="text-sm text-muted-foreground">No episodes found.</p>
                              <Button
                                variant="link"
                                onClick={() => refreshEpisodes.mutate(animeId())}
                                class="mt-2"
                              >
                                Refresh metadata
                              </Button>
                            </div>
                          </Show>
                          <Show when={episodesData().length > 0}>
                            <div
                              role="list"
                              aria-label="Episode status overview"
                              class="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5"
                            >
                              <For each={episodesData()}>
                                {(episode) => {
                                  const status = episode.downloaded
                                    ? "Downloaded"
                                    : isAired(episode.aired)
                                      ? "Missing"
                                      : "Upcoming";
                                  return (
                                    <div
                                      role="listitem"
                                      aria-label={`Episode ${episode.number}: ${status}`}
                                      class={cn(
                                        "aspect-square rounded-md flex items-center justify-center text-xs font-mono transition-colors",
                                        episode.downloaded
                                          ? "bg-success/20 text-success border border-success/30"
                                          : isAired(episode.aired)
                                            ? "bg-warning/10 text-warning/70 border border-warning/20"
                                            : "bg-muted/30 text-muted-foreground/40 border border-transparent",
                                      )}
                                      title={`Episode ${episode.number}: ${status}${
                                        episode.aired ? ` (Aired: ${episode.aired})` : ""
                                      }`}
                                    >
                                      {episode.number}
                                    </div>
                                  );
                                }}
                              </For>
                            </div>
                          </Show>
                        </TabsContent>

                        <TabsContent value="table">
                          <div class="border rounded-md overflow-auto max-h-[600px]">
                            <Table>
                              <TableHeader class="sticky top-0 bg-card z-10">
                                <TableRow>
                                  <TableHead class="w-[60px] text-center">#</TableHead>
                                  <TableHead>Title</TableHead>
                                  <TableHead class="hidden sm:table-cell w-[120px]">
                                    Aired
                                  </TableHead>
                                  <TableHead class="hidden md:table-cell w-[80px]">
                                    Duration
                                  </TableHead>
                                  <TableHead class="w-[80px] text-right">Status</TableHead>
                                  <TableHead class="hidden md:table-cell">Filename</TableHead>
                                  <TableHead class="w-[50px]"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                <Show when={episodesData().length === 0}>
                                  <TableRow>
                                    <TableCell colSpan={7} class="h-24 text-center">
                                      No episodes found.
                                    </TableCell>
                                  </TableRow>
                                </Show>
                                <For each={episodesData()}>
                                  {(episode) => (
                                    <TableRow class="group cursor-default">
                                      <TableCell class="font-medium text-center text-muted-foreground group-hover:text-foreground">
                                        {episode.number}
                                      </TableCell>
                                      <TableCell class="font-medium max-w-[150px] sm:max-w-[250px] md:max-w-[350px]">
                                        <div
                                          class="truncate"
                                          title={episode.title || `Episode ${episode.number}`}
                                        >
                                          {episode.title || `Episode ${episode.number}`}
                                        </div>
                                      </TableCell>
                                      <TableCell class="hidden sm:table-cell text-muted-foreground text-sm">
                                        {episode.aired
                                          ? new Date(episode.aired).toLocaleDateString()
                                          : "-"}
                                      </TableCell>
                                      <TableCell class="hidden md:table-cell text-muted-foreground text-sm">
                                        {formatDurationSeconds(episode.duration_seconds) || "-"}
                                      </TableCell>
                                      <TableCell class="text-right">
                                        <div class="flex justify-end pr-2">
                                          <Show
                                            when={episode.downloaded}
                                            fallback={
                                              <Tooltip>
                                                <TooltipTrigger>
                                                  <IconX
                                                    class={cn(
                                                      "h-4 w-4",
                                                      isAired(episode.aired)
                                                        ? "text-warning/70"
                                                        : "text-muted-foreground/30",
                                                    )}
                                                  />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  {isAired(episode.aired) ? "Missing" : "Upcoming"}
                                                </TooltipContent>
                                              </Tooltip>
                                            }
                                          >
                                            <Tooltip>
                                              <TooltipTrigger>
                                                <IconCircleCheck class="h-4 w-4 text-success" />
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                Downloaded - {episode.file_path?.split("/").pop()}
                                              </TooltipContent>
                                            </Tooltip>
                                          </Show>
                                        </div>
                                      </TableCell>
                                      <TableCell class="hidden md:table-cell text-sm text-muted-foreground font-mono truncate max-w-[200px]">
                                        <Show when={episode.file_path} fallback="-">
                                          <div
                                            class="truncate"
                                            title={episode.file_path?.split("/").pop()}
                                          >
                                            {episode.file_path?.split("/").pop()}
                                          </div>
                                        </Show>
                                      </TableCell>
                                      <TableCell>
                                        <DropdownMenu>
                                          <DropdownMenuTrigger
                                            as={Button}
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Actions for episode ${episode.number}`}
                                            class="relative after:absolute after:-inset-2 h-8 w-8 text-muted-foreground hover:text-foreground"
                                          >
                                            <IconDots class="h-4 w-4" />
                                          </DropdownMenuTrigger>
                                          <DropdownMenuContent>
                                            <DropdownMenuItem
                                              onClick={() =>
                                                setSearchModalState(() => ({
                                                  open: true,
                                                  episodeNumber: episode.number,
                                                  ...(episode.title === undefined
                                                    ? {}
                                                    : { episodeTitle: episode.title }),
                                                }))
                                              }
                                            >
                                              <Show
                                                when={episode.downloaded}
                                                fallback={
                                                  <>
                                                    <IconSearch class="h-4 w-4 mr-2" />
                                                    Search
                                                  </>
                                                }
                                              >
                                                <IconRefresh class="h-4 w-4 mr-2" />
                                                Replace
                                              </Show>
                                            </DropdownMenuItem>
                                            <Show when={!episode.downloaded}>
                                              <DropdownMenuItem
                                                onClick={() =>
                                                  setMappingDialogState({
                                                    open: true,
                                                    episodeNumber: episode.number,
                                                  })
                                                }
                                              >
                                                <IconLink class="h-4 w-4 mr-2" />
                                                Manual Map
                                              </DropdownMenuItem>
                                            </Show>
                                            <Show when={episode.downloaded}>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                class="text-destructive focus:text-destructive"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setDeleteEpisodeState({
                                                    open: true,
                                                    episodeNumber: episode.number,
                                                  });
                                                }}
                                              >
                                                <IconTrash class="h-4 w-4 mr-2" />
                                                Delete File
                                              </DropdownMenuItem>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                onClick={() => handlePlayInMpv(episode.number)}
                                              >
                                                <IconPlayerPlay class="h-4 w-4 mr-2" />
                                                Play in MPV
                                              </DropdownMenuItem>
                                              <DropdownMenuItem
                                                onClick={() => handleCopyStreamLink(episode.number)}
                                              >
                                                <IconCopy class="h-4 w-4 mr-2" />
                                                Copy Stream Link
                                              </DropdownMenuItem>
                                            </Show>
                                          </DropdownMenuContent>
                                        </DropdownMenu>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </For>
                              </TableBody>
                            </Table>
                          </div>
                        </TabsContent>
                      </CardContent>
                    </Card>
                  </Tabs>
                </Suspense>

                <AnimeDiscoverySection anime={anime()} libraryIds={libraryIds()} />

                {/* Info */}
                <Card>
                  <CardHeader class="pb-3">
                    <CardTitle class="text-base">Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl class="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt class="text-muted-foreground">Root Folder</dt>
                        <dd class="font-mono text-xs mt-1 truncate flex items-center justify-between gap-2 group">
                          <span class="truncate" title={anime().root_folder}>
                            {anime().root_folder}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setEditPathOpen(true)}
                            aria-label="Edit path"
                          >
                            <IconPencil class="h-3 w-3" />
                          </Button>
                        </dd>
                      </div>
                      <div>
                        <dt class="text-muted-foreground">Added</dt>
                        <dd class="mt-1">{new Date(anime().added_at).toLocaleDateString()}</dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </Show>

      {/* Dialogs */}
      <SearchModal
        animeId={animeId()}
        episodeNumber={searchModalState().episodeNumber}
        {...(searchModalState().episodeTitle === undefined
          ? {}
          : { episodeTitle: searchModalState().episodeTitle })}
        open={searchModalState().open}
        onOpenChange={(open) => setSearchModalState((prev) => ({ ...prev, open }))}
      />

      <RenameDialog
        animeId={animeId()}
        open={renameDialogOpen()}
        onOpenChange={setRenameDialogOpen}
      />

      <ManualMappingDialog
        animeId={animeId()}
        episodeNumber={mappingDialogState().episodeNumber}
        open={mappingDialogState().open}
        onOpenChange={(open) => setMappingDialogState((prev) => ({ ...prev, open }))}
      />

      <BulkMappingDialog
        animeId={animeId()}
        open={bulkMappingOpen()}
        onOpenChange={setBulkMappingOpen}
      />

      <AlertDialog
        open={deleteEpisodeState().open}
        onOpenChange={(open) => setDeleteEpisodeState((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete Episode {deleteEpisodeState().episodeNumber}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the file from disk. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteEpisodeFile.mutate(
                  {
                    animeId: animeId(),
                    episodeNumber: deleteEpisodeState().episodeNumber,
                  },
                  {
                    onSuccess: () => {
                      toast.success("Episode file deleted");
                    },
                    onError: (err) => {
                      toast.error(`Failed to delete file: ${err.message}`);
                    },
                  },
                );
                setDeleteEpisodeState((prev) => ({ ...prev, open: false }));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditPathDialog
        open={editPathOpen()}
        onOpenChange={setEditPathOpen}
        currentPath={animeQuery.data?.root_folder || ""}
        animeId={animeId()}
        updatePath={updatePath.mutateAsync}
        isPending={updatePath.isPending}
      />

      <EditProfileDialog
        open={editProfileOpen()}
        onOpenChange={setEditProfileOpen}
        currentProfile={animeQuery.data?.profile_name || ""}
        currentReleaseProfileIds={animeQuery.data?.release_profile_ids || []}
        animeId={animeId()}
        updateProfile={updateProfile.mutateAsync}
        isUpdatingProfile={updateProfile.isPending}
        updateReleaseProfiles={updateReleaseProfiles.mutateAsync}
        isUpdatingReleaseProfiles={updateReleaseProfiles.isPending}
        profiles={profilesQuery.data || []}
        releaseProfiles={releaseProfilesQuery.data || []}
      />
    </div>
  );
}
