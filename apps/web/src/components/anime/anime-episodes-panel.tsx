import {
  SquaresFourIcon,
  ListIcon,
} from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { EpisodeTableRow } from "~/components/anime/episode-table-row";
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "~/components/anime/anime-details-types";
import type { Episode } from "~/lib/api";
import { isAired } from "~/lib/date-time";
import { cn } from "~/lib/utils";

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
                    <EpisodeTableRow
                      key={episode.number}
                      episode={episode}
                      onOpenSearchModal={props.onOpenSearchModal}
                      onOpenMappingDialog={props.onOpenMappingDialog}
                      onOpenDeleteDialog={props.onOpenDeleteDialog}
                      onPlayInMpv={props.onPlayInMpv}
                      onCopyStreamLink={props.onCopyStreamLink}
                    />
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
