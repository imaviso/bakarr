import { DotsThreeIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "~/components/shared/empty-state";
import { GeneralError } from "~/components/shared/general-error";
import { PageHeader } from "~/app/layout/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { createSystemTaskQuery, isTaskActive } from "~/api/operations-tasks";
import { createSearchMissingMutation } from "~/api/system-downloads";
import { systemConfigQueryOptions } from "~/api/system-config";
import { wantedQueryOptions } from "~/api/system-wanted";
import type { MissingEpisode } from "~/api/contracts";
import { usePageTitle } from "~/domain/page-title";
import {
  formatAiringDateWithPreferences,
  formatNextAiringEpisode,
  getAiringDisplayPreferences,
} from "~/domain/anime/metadata";

const WANTED_LIMIT = 100;

const SearchModalLazy = lazy(() =>
  import("~/features/search/search-modal").then((module) => ({
    default: module.SearchModal,
  })),
);

export const Route = createFileRoute("/_layout/wanted")({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData(wantedQueryOptions(WANTED_LIMIT)),
      queryClient.ensureQueryData(systemConfigQueryOptions()),
    ]);
  },
  component: WantedPage,
  errorComponent: GeneralError,
});

function WantedPage() {
  usePageTitle("Wanted");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wantedData = useSuspenseQuery(wantedQueryOptions(WANTED_LIMIT)).data;
  const systemConfig = useSuspenseQuery(systemConfigQueryOptions()).data;
  const [latestMissingSearchTaskId, setLatestMissingSearchTaskId] = useState<number | undefined>(
    undefined,
  );
  const latestMissingSearchTask = createSystemTaskQuery(latestMissingSearchTaskId);
  const searchMissing = createSearchMissingMutation();
  const isSearchMissingRunning =
    latestMissingSearchTask.data !== undefined && isTaskActive(latestMissingSearchTask.data);
  const data = wantedData;
  const airingPreferences = getAiringDisplayPreferences(systemConfig.library);

  const getScrollElement = useCallback(() => scrollRef.current, []);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    estimateSize: () => 56,
    overscan: 10,
    getScrollElement,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  const paddingTop = firstVirtualItem ? firstVirtualItem.start : 0;
  const paddingBottom = lastVirtualItem ? rowVirtualizer.getTotalSize() - lastVirtualItem.end : 0;

  const [searchModalState, setSearchModalState] = useState<{
    open: boolean;
    animeId: number;
    episodeNumber: number;
    episodeTitle?: string;
  }>({
    open: false,
    animeId: 0,
    episodeNumber: 1,
  });

  const handleSearchAll = () => {
    searchMissing.mutate(undefined, {
      onSuccess: (accepted) => {
        setLatestMissingSearchTaskId(accepted.task_id);
      },
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-2">
      <PageHeader
        title="Wanted"
        subtitle={
          data.length >= WANTED_LIMIT
            ? `Showing first ${WANTED_LIMIT} missing episodes`
            : `${data.length} missing episodes`
        }
      >
        <Button
          variant="default"
          size="sm"
          onClick={handleSearchAll}
          disabled={searchMissing.isPending || isSearchMissingRunning || data.length === 0}
        >
          <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
          {searchMissing.isPending || isSearchMissingRunning ? "Searching..." : "Search All"}
        </Button>
      </PageHeader>

      <Card className="overflow-hidden flex-1 min-h-0 flex flex-col">
        <div ref={scrollRef} className="h-full min-h-0 w-full flex-1 overflow-auto">
          <Table className="table-fixed w-full min-w-[860px] md:min-w-0">
            <TableHeader className="sticky top-0 bg-card z-10 border-b">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead scope="col" className="w-[60px]" />
                <TableHead scope="col">Anime</TableHead>
                <TableHead scope="col" className="w-[100px]">
                  Episode
                </TableHead>
                <TableHead scope="col" className="hidden md:table-cell">
                  Title
                </TableHead>
                <TableHead scope="col" className="w-[150px]">
                  Air Date
                </TableHead>
                <TableHead scope="col" className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length > 0 ? (
                <>
                  {paddingTop > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={6}
                        style={{
                          height: `${paddingTop}px`,
                          padding: "0",
                          border: "none",
                        }}
                      />
                    </tr>
                  )}
                  {virtualItems.map((vRow) => {
                    const item = data[vRow.index];
                    return (
                      item && (
                        <WantedRow
                          key={`${item.anime_id}-${item.episode_number}`}
                          item={item}
                          airingPreferences={airingPreferences}
                          onSearch={() => {
                            const episodeTitle = item.episode_title;
                            setSearchModalState(
                              episodeTitle === undefined
                                ? {
                                    open: true,
                                    animeId: item.anime_id,
                                    episodeNumber: item.episode_number,
                                  }
                                : {
                                    open: true,
                                    animeId: item.anime_id,
                                    episodeNumber: item.episode_number,
                                    episodeTitle,
                                  },
                            );
                          }}
                        />
                      )
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={6}
                        style={{
                          height: `${paddingBottom}px`,
                          padding: "0",
                          border: "none",
                        }}
                      />
                    </tr>
                  )}
                </>
              ) : (
                <EmptyState asTableCell colSpan={6} compact title="No missing episodes found" />
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Suspense fallback={null}>
        <SearchModalLazy
          animeId={searchModalState.animeId}
          episodeNumber={searchModalState.episodeNumber}
          {...(searchModalState.episodeTitle === undefined
            ? {}
            : { episodeTitle: searchModalState.episodeTitle })}
          open={searchModalState.open}
          onOpenChange={(open) => setSearchModalState((prev) => ({ ...prev, open }))}
        />
      </Suspense>
    </div>
  );
}

function WantedRow(props: {
  item: MissingEpisode;
  airingPreferences: ReturnType<typeof getAiringDisplayPreferences>;
  onSearch: () => void;
}) {
  const statusLabel =
    props.item.airing_status === "future"
      ? "Upcoming"
      : props.item.airing_status === "aired"
        ? "Missing"
        : undefined;

  return (
    <TableRow>
      <TableCell>
        <div className="h-10 w-7 rounded-none overflow-hidden bg-muted">
          {props.item.anime_image && (
            <img
              src={props.item.anime_image}
              alt={props.item.anime_title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
        </div>
      </TableCell>
      <TableCell className="font-medium">
        <Link
          to="/anime/$id"
          params={{ id: props.item.anime_id.toString() }}
          className="hover:underline"
        >
          {props.item.anime_title}
        </Link>
        {props.item.next_airing_episode && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {formatNextAiringEpisode(props.item.next_airing_episode, props.airingPreferences) ||
              "Next airing scheduled"}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline" className="font-mono font-normal">
            {props.item.episode_number.toString().padStart(2, "0")}
          </Badge>
          {statusLabel && (
            <Badge
              variant="secondary"
              className={
                props.item.airing_status === "aired"
                  ? "h-5 px-1.5 text-xs bg-warning/10 text-warning"
                  : "h-5 px-1.5 text-xs bg-info/10 text-info"
              }
            >
              {statusLabel}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
        {props.item.episode_title || "-"}
      </TableCell>
      <TableCell className="text-sm">
        {formatAiringDateWithPreferences(props.item.aired, props.airingPreferences) || "-"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" />}
            className="relative after:absolute after:-inset-2 h-8 w-8"
            aria-label="Episode options"
          >
            <DotsThreeIcon className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={props.onSearch}>
              <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
              Search
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
