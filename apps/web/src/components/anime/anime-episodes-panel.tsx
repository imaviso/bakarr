import {
  CheckCircleIcon,
  CopyIcon,
  DotsThreeIcon,
  SquaresFourIcon,
  LinkIcon,
  ListIcon,
  PlayIcon,
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
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
  const hasEpisodes = props.episodes.length > 0;

  return (
    <Tabs defaultValue="grid" className="w-full">
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Episodes</CardTitle>
          <TabsList>
            <TabsTrigger value="grid">
              <SquaresFourIcon className="h-4 w-4 mr-2" />
              Grid
            </TabsTrigger>
            <TabsTrigger value="table">
              <ListIcon className="h-4 w-4 mr-2" />
              Table
            </TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent>
          <TabsContent value="grid">
            {!hasEpisodes && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">No episodes found.</p>
                <Button variant="link" onClick={props.onRefreshMetadata} className="mt-2">
                  Refresh metadata
                </Button>
              </div>
            )}

            {hasEpisodes && (
              <div
                role="list"
                aria-label="Episode status overview"
                className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5"
              >
                {props.episodes.map((episode) => {
                  const status = episode.downloaded
                    ? "Downloaded"
                    : isAired(episode.aired)
                      ? "Missing"
                      : "Upcoming";

                  return (
                    <div
                      key={episode.number}
                      role="listitem"
                      aria-label={`Episode ${episode.number}: ${status}`}
                      className={cn(
                        "aspect-square flex items-center justify-center rounded-none text-xs font-mono transition-colors",
                        episode.downloaded
                          ? "bg-success/20 text-success border border-success/30"
                          : isAired(episode.aired)
                            ? "bg-warning/10 text-warning border border-warning/20"
                            : "bg-muted text-muted-foreground border border-transparent",
                      )}
                      title={`Episode ${episode.number}: ${status}${
                        episode.aired ? ` (Aired: ${episode.aired})` : ""
                      }`}
                    >
                      {episode.number}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="table">
            <div className="border rounded-none overflow-auto max-h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-[60px] text-center">#</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="hidden sm:table-cell w-[120px]">Aired</TableHead>
                    <TableHead className="hidden md:table-cell w-[80px]">Duration</TableHead>
                    <TableHead className="w-[80px] text-right">Status</TableHead>
                    <TableHead className="hidden md:table-cell">Filename</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!hasEpisodes && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        No episodes found.
                      </TableCell>
                    </TableRow>
                  )}

                  {props.episodes.map((episode) => (
                    <TableRow key={episode.number} className="group cursor-default">
                      <TableCell className="font-medium text-center text-muted-foreground group-hover:text-foreground">
                        {episode.number}
                      </TableCell>
                      <TableCell className="font-medium max-w-[150px] sm:max-w-[250px] md:max-w-[350px]">
                        <div
                          className="truncate"
                          title={episode.title || `Episode ${episode.number}`}
                        >
                          {episode.title || `Episode ${episode.number}`}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {episode.aired ? new Date(episode.aired).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {formatDurationSeconds(episode.duration_seconds) || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end pr-2">
                          {episode.downloaded ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircleIcon className="h-4 w-4 text-success" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Downloaded - {episode.file_path?.split("/").pop()}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger>
                                <XIcon
                                  className={cn(
                                    "h-4 w-4",
                                    isAired(episode.aired)
                                      ? "text-warning"
                                      : "text-muted-foreground",
                                  )}
                                />
                              </TooltipTrigger>
                              <TooltipContent>
                                {isAired(episode.aired) ? "Missing" : "Upcoming"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono truncate max-w-[200px]">
                        {episode.file_path ? (
                          <div className="truncate" title={episode.file_path.split("/").pop()}>
                            {episode.file_path.split("/").pop()}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon" />}
                            aria-label={`Actions for episode ${episode.number}`}
                            className="relative after:absolute after:-inset-2 h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <DotsThreeIcon className="h-4 w-4" />
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
                              {episode.downloaded ? (
                                <>
                                  <ArrowClockwiseIcon className="h-4 w-4 mr-2" />
                                  Replace
                                </>
                              ) : (
                                <>
                                  <MagnifyingGlassIcon className="h-4 w-4 mr-2" />
                                  Search
                                </>
                              )}
                            </DropdownMenuItem>

                            {!episode.downloaded && (
                              <DropdownMenuItem
                                onClick={() =>
                                  props.onOpenMappingDialog({
                                    open: true,
                                    episodeNumber: episode.number,
                                  })
                                }
                              >
                                <LinkIcon className="h-4 w-4 mr-2" />
                                Manual Map
                              </DropdownMenuItem>
                            )}

                            {episode.downloaded && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    props.onOpenDeleteDialog({
                                      open: true,
                                      episodeNumber: episode.number,
                                    });
                                  }}
                                >
                                  <TrashIcon className="h-4 w-4 mr-2" />
                                  Delete File
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => props.onPlayInMpv(episode.number)}>
                                  <PlayIcon className="h-4 w-4 mr-2" />
                                  Play in MPV
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => props.onCopyStreamLink(episode.number)}
                                >
                                  <CopyIcon className="h-4 w-4 mr-2" />
                                  Copy Stream Link
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  );
}
