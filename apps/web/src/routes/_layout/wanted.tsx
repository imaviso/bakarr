import { DotsThreeIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense, lazy, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EmptyState } from "~/components/shared/empty-state";
import { GeneralError } from "~/components/shared/general-error";
import { PageHeader } from "~/app/layout/page-header";
import { PageShell } from "~/app/layout/page-shell";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import { useSystemTaskQuery, isTaskActive } from "~/api/operations-tasks";
import { useSearchMissingMutation } from "~/api/system-downloads";
import { systemConfigQueryOptions } from "~/api/system-config";
import { wantedQueryOptions } from "~/api/system-wanted";
import type { MissingUnit } from "~/api/contracts";
import { mediaUnitLabel } from "~/domain/media-unit";
import { usePageTitle } from "~/domain/page-title";
import {
  formatAiringDateWithPreferences,
  formatNextAiringEpisode,
  getAiringDisplayPreferences,
} from "~/domain/media/metadata";

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
  const latestMissingSearchTask = useSystemTaskQuery(latestMissingSearchTaskId);
  const searchMissing = useSearchMissingMutation();
  const isSearchMissingRunning =
    latestMissingSearchTask.data !== undefined && isTaskActive(latestMissingSearchTask.data);
  const data = wantedData;
  const airingPreferences = getAiringDisplayPreferences(systemConfig.library);

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
    mediaId: number;
    unitNumber: number;
    unitTitle?: string;
    unitKind?: MissingUnit["unit_kind"];
  }>({
    open: false,
    mediaId: 0,
    unitNumber: 1,
  });

  const handleSearchAll = () => {
    searchMissing.mutate(undefined, {
      onSuccess: (accepted) => {
        setLatestMissingSearchTaskId(accepted.task_id);
      },
    });
  };

  return (
    <PageShell scroll="inner">
      <PageHeader
        title="Wanted"
        subtitle={
          data.length >= WANTED_LIMIT
            ? `Showing first ${WANTED_LIMIT} missing units`
            : `${data.length} missing units`
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border">
        <div ref={scrollRef} className="h-full min-h-0 w-full flex-1 overflow-auto">
          <Table className="w-full min-w-0 table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead scope="col" className="w-[60px]" />
                <TableHead scope="col">Title</TableHead>
                <TableHead scope="col" className="w-[100px]">
                  Unit
                </TableHead>
                <TableHead scope="col" className="hidden md:table-cell">
                  Unit Title
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
                          key={`${item.media_id}-${item.unit_number}`}
                          item={item}
                          airingPreferences={airingPreferences}
                          onSearch={() => {
                            const unitTitle = item.unit_title;
                            setSearchModalState(
                              unitTitle === undefined
                                ? {
                                    open: true,
                                    mediaId: item.media_id,
                                    unitNumber: item.unit_number,
                                    unitKind: item.unit_kind,
                                  }
                                : {
                                    open: true,
                                    mediaId: item.media_id,
                                    unitNumber: item.unit_number,
                                    unitTitle,
                                    unitKind: item.unit_kind,
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
                <EmptyState asTableCell colSpan={6} compact title="No missing units found" />
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Suspense fallback={null}>
        <SearchModalLazy
          mediaId={searchModalState.mediaId}
          unitNumber={searchModalState.unitNumber}
          unitKind={searchModalState.unitKind}
          {...(searchModalState.unitTitle === undefined
            ? {}
            : { unitTitle: searchModalState.unitTitle })}
          open={searchModalState.open}
          onOpenChange={(open) => setSearchModalState((prev) => ({ ...prev, open }))}
        />
      </Suspense>
    </PageShell>
  );
}

function WantedRow(props: {
  item: MissingUnit;
  airingPreferences: ReturnType<typeof getAiringDisplayPreferences>;
  onSearch: () => void;
}) {
  const statusLabel =
    props.item.airing_status === "future"
      ? "Upcoming"
      : props.item.airing_status === "aired"
        ? "Missing"
        : undefined;
  const unitLabel = mediaUnitLabel(props.item.unit_kind);

  return (
    <TableRow>
      <TableCell>
        <div className="h-10 w-7 rounded-none overflow-hidden bg-muted">
          {props.item.media_image && (
            <img
              src={props.item.media_image}
              alt={props.item.media_title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
        </div>
      </TableCell>
      <TableCell className="font-medium">
        <Link
          to="/media/$id"
          params={{ id: props.item.media_id.toString() }}
          className="hover:underline"
        >
          {props.item.media_title}
        </Link>
        {props.item.next_airing_unit && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            {formatNextAiringEpisode(props.item.next_airing_unit, props.airingPreferences) ||
              "Next airing scheduled"}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Badge variant="outline" className="tabular-nums">
            {unitLabel} {props.item.unit_number.toString().padStart(2, "0")}
          </Badge>
          {statusLabel && (
            <Badge variant={props.item.airing_status === "aired" ? "warning" : "info"}>
              {statusLabel}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell text-muted-foreground truncate max-w-[200px]">
        {props.item.unit_title || "-"}
      </TableCell>
      <TableCell className="text-sm">
        {formatAiringDateWithPreferences(props.item.aired, props.airingPreferences) || "-"}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" />}
            className="relative after:absolute after:-inset-2 h-8 w-8"
            aria-label={`${unitLabel} options`}
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
