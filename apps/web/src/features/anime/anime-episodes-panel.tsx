import { SquaresFourIcon, ListIcon } from "@phosphor-icons/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { EmptyState } from "~/components/shared/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { EpisodeTableRow } from "~/features/anime/episode-table-row";
import type {
  AnimeEpisodeDialogState,
  AnimeSearchModalState,
} from "~/features/anime/anime-details-types";
import type { Episode } from "~/api/contracts";
import { isAired } from "~/domain/date-time";
import { cn } from "~/infra/utils";

interface AnimeEpisodesPanelProps {
  episodes: readonly Episode[];
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
        <CardHeader className="flex flex-row items-center justify-between">
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
              <EmptyState compact title="No episodes found" className="border-dashed">
                <Button variant="link" onClick={props.onRefreshMetadata}>
                  Refresh metadata
                </Button>
              </EmptyState>
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
            <div className="border rounded-none overflow-auto max-h-[600px] min-w-0">
              <Table className="min-w-0">
                <TableHeader className="sticky top-0 bg-card z-10 border-b">
                  <TableRow>
                    <TableHead scope="col" className="w-[60px] text-center">
                      #
                    </TableHead>
                    <TableHead scope="col">Title</TableHead>
                    <TableHead scope="col" className="hidden sm:table-cell w-[120px]">
                      Aired
                    </TableHead>
                    <TableHead scope="col" className="hidden md:table-cell w-[80px]">
                      Duration
                    </TableHead>
                    <TableHead scope="col" className="w-[80px] text-right">
                      Status
                    </TableHead>
                    <TableHead scope="col" className="hidden md:table-cell">
                      Filename
                    </TableHead>
                    <TableHead scope="col" className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!hasEpisodes && (
                    <EmptyState asTableCell colSpan={7} compact title="No episodes found" />
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
