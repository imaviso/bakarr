import {
  IconCircleCheck,
  IconCopy,
  IconDots,
  IconLayoutGrid,
  IconLink,
  IconList,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from "@tabler/icons-solidjs";
import { createMemo, For, Show, Suspense } from "solid-js";
import { Button } from "~/components/ui/button";
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
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "~/components/anime/anime-details-types";
import type { Episode } from "~/lib/api";
import { formatDurationSeconds } from "~/lib/scanned-file";
import { cn } from "~/lib/utils";

function isAired(airedDate?: string) {
  if (!airedDate) return false;
  return new Date(airedDate) <= new Date();
}

interface AnimeEpisodesPanelProps {
  episodes: Episode[];
  onRefreshMetadata: () => void;
  onOpenSearchModal: (state: AnimeSearchModalState) => void;
  onOpenMappingDialog: (state: AnimeEpisodeDialogState) => void;
  onOpenDeleteDialog: (state: AnimeEpisodeDialogState) => void;
  onPlayInMpv: (episodeNumber: number) => void;
  onCopyStreamLink: (episodeNumber: number) => void;
}

export function AnimeEpisodesPanel(props: AnimeEpisodesPanelProps) {
  const hasEpisodes = createMemo(() => props.episodes.length > 0);

  return (
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
              <Show when={!hasEpisodes()}>
                <div class="text-center py-8">
                  <p class="text-sm text-muted-foreground">No episodes found.</p>
                  <Button variant="link" onClick={props.onRefreshMetadata} class="mt-2">
                    Refresh metadata
                  </Button>
                </div>
              </Show>

              <Show when={hasEpisodes()}>
                <div
                  role="list"
                  aria-label="Episode status overview"
                  class="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5"
                >
                  <For each={props.episodes}>
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
                            "aspect-square flex items-center justify-center rounded-none text-xs font-mono transition-colors",
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
                      <TableHead class="hidden sm:table-cell w-[120px]">Aired</TableHead>
                      <TableHead class="hidden md:table-cell w-[80px]">Duration</TableHead>
                      <TableHead class="w-[80px] text-right">Status</TableHead>
                      <TableHead class="hidden md:table-cell">Filename</TableHead>
                      <TableHead class="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <Show when={!hasEpisodes()}>
                      <TableRow>
                        <TableCell colSpan={7} class="h-24 text-center">
                          No episodes found.
                        </TableCell>
                      </TableRow>
                    </Show>

                    <For each={props.episodes}>
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
                            {episode.aired ? new Date(episode.aired).toLocaleDateString() : "-"}
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
                              <div class="truncate" title={episode.file_path?.split("/").pop()}>
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
                                    props.onOpenSearchModal({
                                      open: true,
                                      episodeNumber: episode.number,
                                      ...(episode.title === undefined
                                        ? {}
                                        : { episodeTitle: episode.title }),
                                    })
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
                                      props.onOpenMappingDialog({
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
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      props.onOpenDeleteDialog({
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
                                    onClick={() => props.onPlayInMpv(episode.number)}
                                  >
                                    <IconPlayerPlay class="h-4 w-4 mr-2" />
                                    Play in MPV
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => props.onCopyStreamLink(episode.number)}
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
  );
}
