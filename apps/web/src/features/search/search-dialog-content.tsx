import {
  RiCheckLine,
  RiDownloadLine,
  RiErrorWarningLine,
  RiFilterLine,
  RiLoader4Line,
  RiSearchLine,
  RiSortAsc,
  RiSortDesc,
  RiStarFill,
} from "@remixicon/react";
import type { ReactNode } from "react";
import { cn } from "@/infra/utils";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/shared/icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import type { MediaKind } from "@/api/contracts";
import { mediaUnitLabel } from "@/domain/media-unit";
import { ReleaseSelectionMeta } from "@/features/downloads/release-search/release-meta";
import {
  ReleasePeersCell,
  ReleasePrimaryCell,
} from "@/features/downloads/release-search/release-result-cells";
import {
  CATEGORY_LABELS,
  FILTER_LABELS,
  useSearchDialogReleaseRowState,
  useSearchDialogResultsState,
} from "@/features/search/search-dialog-state";
import { formatSearchResultAge } from "@/domain/date-time";
import type { NyaaSearchResult } from "@/api/contracts";

const categoryItems = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const filterItems = Object.entries(FILTER_LABELS).map(([value, label]) => ({ value, label }));

interface SearchDialogContentProps {
  mediaId: number;
  mediaKind: MediaKind;
  category: string;
  debouncedQuery: string;
  filter: string;
  open: boolean;
  query: string;
  setCategory: (value: string | null) => void;
  setFilter: (value: string | null) => void;
  setOpen: (open: boolean) => void;
  setQuery: (value: string) => void;
  sortCol: keyof NyaaSearchResult;
  sortAsc: boolean;
  setSortCol: (column: keyof NyaaSearchResult) => void;
  setSortAsc: (ascending: boolean) => void;
}

export function SearchDialogContent(props: SearchDialogContentProps) {
  const handleGrab = () => {
    props.setOpen(false);
  };
  const unitKind = props.mediaKind === "anime" ? "episode" : "volume";
  const unitLabel = mediaUnitLabel(unitKind);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background overflow-hidden">
      <DialogTitle className="sr-only">Search Releases</DialogTitle>

      <div className="flex flex-col border-b border-border">
        <div className="flex items-center px-4 py-3 gap-3">
          <RiSearchLine className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            value={props.query}
            onChange={(event) => props.setQuery(event.currentTarget.value)}
            placeholder="Search for releases..."
            className="bg-transparent border-none shadow-none focus-visible:ring-0 text-lg px-0 h-9 placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
          <Select
            selectedKey={props.category}
            onSelectionChange={(value) => props.setCategory(String(value))}
          >
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-xs bg-muted border-transparent hover:bg-muted focus:ring-0 gap-2 rounded-none shadow-none px-2.5">
              <span className="text-muted-foreground">Category:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {categoryItems.map((item) => (
                  <SelectItem key={item.value} id={item.value} textValue={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            selectedKey={props.filter}
            onSelectionChange={(value) => props.setFilter(String(value))}
          >
            <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs bg-muted border-transparent hover:bg-muted focus:ring-0 gap-2 rounded-none shadow-none px-2.5">
              <RiFilterLine className="h-3 w-3 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {filterItems.map((item) => (
                  <SelectItem key={item.value} id={item.value} textValue={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-muted">
        {props.open && (
          <SearchResults
            mediaId={props.mediaId}
            mediaKind={props.mediaKind}
            query={props.debouncedQuery}
            category={props.category}
            filter={props.filter}
            unitLabel={unitLabel}
            onGrab={handleGrab}
            sortAsc={props.sortAsc}
            sortCol={props.sortCol}
            setSortAsc={props.setSortAsc}
            setSortCol={props.setSortCol}
          />
        )}
      </div>

      <div className="px-6 py-2.5 border-t border-border bg-background text-xs text-muted-foreground flex gap-6 items-center overflow-x-auto">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <RiStarFill className="h-3 w-3 text-success fill-success" /> Trusted
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <RiCheckLine className="h-3 w-3 text-info fill-info" /> SeaDex
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <RiCheckLine className="h-3 w-3 text-warning fill-warning" /> SeaDex Best
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <RiErrorWarningLine className="h-3 w-3 text-warning" /> Remake
        </span>
      </div>
    </div>
  );
}

interface ReleaseSortState {
  col: keyof NyaaSearchResult;
  asc: boolean;
  toggle: (column: keyof NyaaSearchResult) => void;
}

function SortableTableHead(props: {
  label: ReactNode;
  align?: "right";
  sort?: ReleaseSortState | undefined;
  column?: keyof NyaaSearchResult | undefined;
}) {
  const base = cn("h-9 text-xs font-medium", props.align === "right" && "text-right");
  const column = props.column;
  const sort = props.sort;
  if (!sort || !column) {
    return (
      <TableHead scope="col" className={base}>
        {props.label}
      </TableHead>
    );
  }
  const active = sort.col === column;
  return (
    <TableHead
      scope="col"
      className={cn(base, "cursor-pointer hover:text-foreground transition-colors select-none")}
      onClick={() => sort.toggle(column)}
    >
      <div className={cn("flex items-center gap-1", props.align === "right" && "justify-end")}>
        {props.label}
        {active &&
          (sort.asc ? <RiSortAsc className="h-3 w-3" /> : <RiSortDesc className="h-3 w-3" />)}
      </div>
    </TableHead>
  );
}

/** Single source of truth for the release-results columns; used by both results and skeleton. */
function ReleaseResultsTableHeader(props: {
  unitHeader: string;
  count?: number | undefined;
  sort?: ReleaseSortState | undefined;
}) {
  return (
    <TableHeader className="sticky top-0 bg-background z-10 border-b border-border">
      <TableRow className="hover:bg-transparent border-border">
        <TableHead scope="col" className="w-[45%] pl-6 h-9 text-xs font-medium">
          Release{props.count !== undefined && ` (${props.count})`}
        </TableHead>
        <SortableTableHead label={props.unitHeader} sort={props.sort} column="parsed_unit" />
        <SortableTableHead label="Res" />
        <SortableTableHead label="Size" sort={props.sort} column="size" />
        <SortableTableHead label="Seeds" align="right" sort={props.sort} column="seeders" />
        <SortableTableHead label="Age" align="right" sort={props.sort} column="pub_date" />
        <TableHead scope="col" className="w-[50px] h-9"></TableHead>
      </TableRow>
    </TableHeader>
  );
}

function SearchResults(props: {
  mediaId: number;
  mediaKind: MediaKind;
  query: string;
  category: string;
  filter: string;
  unitLabel: string;
  onGrab: () => void;
  sortCol: keyof NyaaSearchResult;
  sortAsc: boolean;
  setSortCol: (column: keyof NyaaSearchResult) => void;
  setSortAsc: (ascending: boolean) => void;
}) {
  const state = useSearchDialogResultsState({
    mediaId: props.mediaId,
    category: props.category,
    filter: props.filter,
    query: props.query,
    sortCol: props.sortCol,
    sortAsc: props.sortAsc,
    setSortCol: props.setSortCol,
    setSortAsc: props.setSortAsc,
  });

  if (state.searchQuery.isLoading) {
    return <SearchResultsSkeleton unitHeader={props.mediaKind === "anime" ? "Ep" : "Vol"} />;
  }

  return (
    <div className="h-full overflow-auto">
      <Table>
        <ReleaseResultsTableHeader
          unitHeader={props.mediaKind === "anime" ? "Ep" : "Vol"}
          count={state.searchQuery.data?.results.length}
          sort={{ col: state.sortCol, asc: state.sortAsc, toggle: state.toggleSort }}
        />
        <TableBody>
          {state.sortedResults.length > 0 ? (
            state.sortedResults.map((result) => (
              <ReleaseRow
                key={`${result.indexer}-${result.pub_date}-${result.info_hash ?? result.title}`}
                result={result}
                mediaId={props.mediaId}
                unitLabel={props.unitLabel}
                onGrab={props.onGrab}
              />
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="h-48 p-0">
                <EmptyState
                  compact
                  icon={<RiSearchLine className="h-8 w-8" />}
                  title={state.searchQuery.isError ? "Failed to load results" : "No results found"}
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SearchResultsSkeleton(props: { unitHeader: string }) {
  return (
    <div className="h-full overflow-hidden flex flex-col">
      <Table>
        <ReleaseResultsTableHeader unitHeader={props.unitHeader} />
        <TableBody>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((row) => (
            <TableRow key={`skeleton-${row}`} className="hover:bg-transparent border-border">
              <TableCell className="pl-6 py-2.5">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="h-4 w-8 ml-auto" />
              </TableCell>
              <TableCell className="text-right">
                <Skeleton className="h-4 w-16 ml-auto" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-7 w-7 rounded-none" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ReleaseRow(props: {
  result: NyaaSearchResult;
  mediaId: number;
  unitLabel: string;
  onGrab: () => void;
}) {
  const state = useSearchDialogReleaseRowState({
    mediaId: props.mediaId,
    onGrab: props.onGrab,
    result: props.result,
  });
  const batchCheckboxId = `batch-${props.result.info_hash ?? props.result.title}`;
  const episodeInputId = `episode-${props.result.info_hash ?? props.result.title}`;

  return (
    <TableRow className="group border-b border-border transition-colors hover:bg-muted data-[state=selected]:bg-muted">
      <TableCell className="pl-6 py-2.5 max-w-[260px] sm:max-w-[420px] md:max-w-[520px]">
        <ReleasePrimaryCell
          title={props.result.title}
          sourceUrl={props.result.view_url}
          useTooltip
          titleClass="line-clamp-2 text-sm font-medium leading-tight break-all hover:text-primary transition-colors"
          flags={state.releaseFlags}
          parsedSummary={state.releaseParsedSummary}
          sourceSummary={state.releaseSourceSummary}
          seadexNotes={props.result.seadex_notes}
          seadexTags={props.result.seadex_tags}
          seadexComparison={props.result.seadex_comparison}
          seadexClass="pr-4"
          seadexTagClass="rounded-none"
          selectionKind={state.selectionMetadata.selection_kind}
          selectionLabel={state.selectionLabel}
          selectionSummary={state.selectionSummary}
          confidence={state.releaseConfidence}
          selectionClass="pr-4"
        />
      </TableCell>
      <TableCell className="py-2.5">
        {props.result.parsed_unit ? (
          <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded-none">
            {props.result.parsed_unit}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">-</span>
        )}
      </TableCell>
      <TableCell className="py-2.5 text-xs text-muted-foreground">
        <span title={props.result.parsed_quality || props.result.parsed_resolution}>
          {props.result.parsed_resolution || props.result.parsed_quality || "-"}
        </span>
      </TableCell>
      <TableCell className="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {props.result.size}
      </TableCell>
      <TableCell className="py-2.5 text-right">
        <ReleasePeersCell seeders={props.result.seeders} leechers={props.result.leechers} />
      </TableCell>
      <TableCell className="py-2.5 text-right text-xs text-muted-foreground whitespace-nowrap">
        {formatSearchResultAge(props.result.pub_date)}
      </TableCell>
      <TableCell className="py-2.5 pr-4">
        <PopoverTrigger isOpen={state.popoverOpen} onOpenChange={state.setPopoverOpen}>
          <IconButton
            size="icon-sm"
            reveal
            className="hover:bg-primary/10 hover:text-primary"
            aria-label="Download release"
          >
            <RiDownloadLine className="h-4 w-4" />
          </IconButton>
          <Popover className="w-72 p-3">
            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-xs font-medium text-foreground">Confirm Download</h4>
                <p className="text-xs text-muted-foreground">
                  {state.isBatch
                    ? `Enter the ${props.unitLabel.toLowerCase()} number for the first file in this pack.`
                    : `Enter the ${props.unitLabel.toLowerCase()} number this release should map to.`}
                </p>
                {state.selectionSummary && (
                  <ReleaseSelectionMeta
                    selectionKind={state.selectionMetadata.selection_kind}
                    selectionLabel={state.selectionLabel}
                    selectionSummary={state.selectionSummary}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={batchCheckboxId}
                  isSelected={state.isBatch}
                  onChange={state.setIsBatch}
                />
                <Label htmlFor={batchCheckboxId} className="text-xs">
                  Batch or pack (multiple {props.unitLabel.toLowerCase()}s)
                </Label>
              </div>
              <div className="space-y-1">
                <Label htmlFor={episodeInputId} className="text-xs text-muted-foreground">
                  {state.isBatch
                    ? `First ${props.unitLabel.toLowerCase()} in pack`
                    : `${props.unitLabel} number`}
                </Label>
                {state.isBatch && (
                  <p className="text-xs leading-snug text-muted-foreground">
                    Example: for {props.unitLabel.toLowerCase()}s 13-24, enter 13. Files after it
                    map in order.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    id={episodeInputId}
                    value={state.episodeNumberInput}
                    onChange={(event) => state.setEpisodeNumberInput(event.currentTarget.value)}
                    className="h-7 text-xs font-mono"
                    placeholder={
                      state.isBatch ? `First ${props.unitLabel}` : `${props.unitLabel} #`
                    }
                  />
                </div>
                <Button
                  size="sm"
                  onPress={state.handleGrab}
                  isDisabled={
                    state.grabMutation.isPending || (!state.isBatch && !state.episodeNumberInput)
                  }
                  className="h-7 px-3 text-xs"
                >
                  {state.grabMutation.isPending ? (
                    <RiLoader4Line className="h-3 w-3 animate-spin" />
                  ) : (
                    "Download"
                  )}
                </Button>
              </div>
            </div>
          </Popover>
        </PopoverTrigger>
      </TableCell>
    </TableRow>
  );
}
