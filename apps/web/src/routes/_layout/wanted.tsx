import { DotsThreeIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as v from "valibot";
import { GeneralError } from "~/components/general-error";
import { PageHeader } from "~/components/page-header";
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
import {
  createSystemTaskQuery,
  createSearchMissingMutation,
  createSystemConfigQuery,
  createWantedQuery,
  type MissingEpisode,
} from "~/lib/api";
import { usePageTitle } from "~/lib/page-title";
import {
  formatAiringDateWithPreferences,
  formatNextAiringEpisode,
  getAiringDisplayPreferences,
} from "~/lib/anime-metadata";

const SearchModalLazy = lazy(() =>
  import("~/components/search-modal").then((module) => ({
    default: module.SearchModal,
  })),
);

const WantedSearchSchema = v.object({
  q: v.optional(v.string(), ""),
});

export const Route = createFileRoute("/_layout/wanted")({
  validateSearch: (search) => v.parse(WantedSearchSchema, search),
  component: WantedPage,
  errorComponent: GeneralError,
});

function WantedPage() {
  usePageTitle(() => "Wanted");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const limit = 100;
  const wantedQuery = createWantedQuery(limit);
  const configQuery = createSystemConfigQuery();
  const [latestMissingSearchTaskId, setLatestMissingSearchTaskId] = useState<number | undefined>(
    undefined,
  );
  createSystemTaskQuery(latestMissingSearchTaskId);
  const searchMissing = createSearchMissingMutation();
  const data = useMemo(() => wantedQuery.data ?? [], [wantedQuery.data]);
  const airingPreferences = useMemo(
    () => getAiringDisplayPreferences(configQuery.data?.library),
    [configQuery.data],
  );

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    estimateSize: () => 56,
    overscan: 10,
    getScrollElement: () => scrollRef.current,
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
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-6">
      <PageHeader title="Wanted" subtitle={`${data.length} missing episodes`}>
        <Button
          variant="default"
          size="sm"
          onClick={handleSearchAll}
          disabled={searchMissing.isPending || wantedQuery.data?.length === 0}
        >
          <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
          Search All
        </Button>
      </PageHeader>

      <Card className="overflow-hidden flex-1 min-h-0 flex flex-col">
        <div ref={scrollRef} className="h-full overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 border-b">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[60px]" />
                <TableHead>Anime</TableHead>
                <TableHead className="w-[100px]">Episode</TableHead>
                <TableHead className="hidden md:table-cell">Title</TableHead>
                <TableHead className="w-[150px]">Air Date</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!wantedQuery.isLoading && data.length > 0 ? (
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
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    {wantedQuery.isLoading ? "Loading..." : "No missing episodes found."}
                  </TableCell>
                </TableRow>
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
  const statusLabel = () =>
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
          {statusLabel() && (
            <Badge
              variant="secondary"
              className={
                props.item.airing_status === "aired"
                  ? "h-5 px-1.5 text-xs bg-warning/10 text-warning"
                  : "h-5 px-1.5 text-xs bg-info/10 text-info"
              }
            >
              {statusLabel()}
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
