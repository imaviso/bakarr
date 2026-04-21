import {
  WarningIcon,
  CheckIcon,
  DownloadIcon,
  FunnelIcon,
  SpinnerIcon,
  MagnifyingGlassIcon,
  SortAscendingIcon,
  SortDescendingIcon,
  StarIcon,
} from "@phosphor-icons/react";
import { Suspense } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { DialogContent, DialogTitle } from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { ReleaseSelectionMeta } from "~/components/release-search/release-meta";
import {
  ReleasePeersCell,
  ReleasePrimaryCell,
} from "~/components/release-search/release-result-cells";
import {
  CATEGORY_LABELS,
  FILTER_LABELS,
  formatSearchResultAge,
  useSearchDialogReleaseRowState,
  useSearchDialogResultsState,
} from "~/components/search-dialog-state";
import type { NyaaSearchResult } from "~/lib/api";

const categoryOptions = Object.keys(CATEGORY_LABELS);
const filterOptions = Object.keys(FILTER_LABELS);

interface SearchDialogContentProps {
  animeId: number;
  category: string;
  debouncedQuery: string;
  filter: string;
  open: boolean;
  query: string;
  setCategory: (value: string | null) => void;
  setFilter: (value: string | null) => void;
  setOpen: (open: boolean) => void;
  setQuery: (value: string) => void;
}

export function SearchDialogContent(props: SearchDialogContentProps) {
  return (
    <DialogContent className="sm:max-w-7xl w-full h-[85vh] flex flex-col p-0 gap-0 border-none sm:rounded-none bg-background overflow-hidden">
      <DialogTitle className="sr-only">Search Releases</DialogTitle>

      <div className="flex flex-col border-b border-border">
        <div className="flex items-center px-4 py-3 gap-3">
          <MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground shrink-0" />
          <Input
            value={props.query}
            onChange={(event) => props.setQuery(event.currentTarget.value)}
            placeholder="Search for releases..."
            className="bg-transparent border-none shadow-none focus-visible:ring-0 text-lg px-0 h-9 placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
          <Select value={props.category} onValueChange={(value) => props.setCategory(value)}>
            <SelectTrigger className="h-7 w-auto min-w-[130px] text-xs bg-muted border-transparent hover:bg-muted focus:ring-0 gap-2 rounded-none shadow-none px-2.5">
              <span className="text-muted-foreground">Category:</span>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {CATEGORY_LABELS[option] ?? option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.filter} onValueChange={(value) => props.setFilter(value)}>
            <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs bg-muted border-transparent hover:bg-muted focus:ring-0 gap-2 rounded-none shadow-none px-2.5">
              <FunnelIcon className="h-3 w-3 text-muted-foreground" />
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {FILTER_LABELS[option] ?? option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-muted">
        <Suspense fallback={<SearchResultsSkeleton />}>
          {props.open && (
            <SearchResults
              animeId={props.animeId}
              query={props.debouncedQuery}
              category={props.category}
              filter={props.filter}
              onGrab={() => props.setOpen(false)}
            />
          )}
        </Suspense>
      </div>

      <div className="px-6 py-2.5 border-t border-border bg-background text-xs text-muted-foreground flex gap-6 items-center overflow-x-auto">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <StarIcon weight="fill" className="h-3 w-3 text-success fill-success" /> Trusted
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <CheckIcon className="h-3 w-3 text-info fill-info" /> SeaDex
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <CheckIcon className="h-3 w-3 text-warning fill-warning" /> SeaDex Best
        </span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <WarningIcon className="h-3 w-3 text-warning" /> Remake
        </span>
      </div>
    </DialogContent>
  );
}

function SearchResults(props: {
  animeId: number;
  query: string;
  category: string;
  filter: string;
  onGrab: () => void;
}) {
  const state = useSearchDialogResultsState({
    animeId: props.animeId,
    category: props.category,
    filter: props.filter,
    query: props.query,
  });

  return (
    <div className="h-full overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10 border-b border-border">
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-[45%] pl-6 h-9 text-xs font-medium">
              Release ({state.searchQuery.data?.results.length ?? 0})
            </TableHead>
            <TableHead
              className="h-9 text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => state.toggleSort("parsed_episode")}
            >
              <div className="flex items-center gap-1">
                Ep
                {state.sortCol === "parsed_episode" &&
                  (state.sortAsc ? (
                    <SortAscendingIcon className="h-3 w-3" />
                  ) : (
                    <SortDescendingIcon className="h-3 w-3" />
                  ))}
              </div>
            </TableHead>
            <TableHead className="h-9 text-xs font-medium">Res</TableHead>
            <TableHead
              className="h-9 text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => state.toggleSort("size")}
            >
              <div className="flex items-center gap-1">
                Size
                {state.sortCol === "size" &&
                  (state.sortAsc ? (
                    <SortAscendingIcon className="h-3 w-3" />
                  ) : (
                    <SortDescendingIcon className="h-3 w-3" />
                  ))}
              </div>
            </TableHead>
            <TableHead
              className="h-9 text-xs font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => state.toggleSort("seeders")}
            >
              <div className="flex items-center justify-end gap-1">
                Seeds
                {state.sortCol === "seeders" &&
                  (state.sortAsc ? (
                    <SortAscendingIcon className="h-3 w-3" />
                  ) : (
                    <SortDescendingIcon className="h-3 w-3" />
                  ))}
              </div>
            </TableHead>
            <TableHead
              className="h-9 text-xs font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => state.toggleSort("pub_date")}
            >
              <div className="flex items-center justify-end gap-1">
                Age
                {state.sortCol === "pub_date" &&
                  (state.sortAsc ? (
                    <SortAscendingIcon className="h-3 w-3" />
                  ) : (
                    <SortDescendingIcon className="h-3 w-3" />
                  ))}
              </div>
            </TableHead>
            <TableHead className="w-[50px] h-9"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {state.sortedResults.length > 0 ? (
            state.sortedResults.map((result) => (
              <ReleaseRow
                key={result.info_hash ?? result.title}
                result={result}
                animeId={props.animeId}
                onGrab={props.onGrab}
              />
            ))
          ) : (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="h-48 text-center">
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <MagnifyingGlassIcon className="h-8 w-8 opacity-20" />
                  <p className="text-sm">
                    {state.searchQuery.isError ? "Failed to load results" : "No results found"}
                  </p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SearchResultsSkeleton() {
  return (
    <div className="h-full overflow-hidden flex flex-col">
      <Table>
        <TableHeader className="sticky top-0 bg-background z-10 border-b border-border">
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-[45%] pl-6 h-9 text-xs font-medium">Release</TableHead>
            <TableHead className="h-9 text-xs font-medium">Ep</TableHead>
            <TableHead className="h-9 text-xs font-medium">Res</TableHead>
            <TableHead className="h-9 text-xs font-medium">Size</TableHead>
            <TableHead className="h-9 text-xs font-medium text-right">Seeds</TableHead>
            <TableHead className="h-9 text-xs font-medium text-right">Age</TableHead>
            <TableHead className="w-[50px] h-9"></TableHead>
          </TableRow>
        </TableHeader>
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

function ReleaseRow(props: { result: NyaaSearchResult; animeId: number; onGrab: () => void }) {
  const state = useSearchDialogReleaseRowState({
    animeId: props.animeId,
    onGrab: props.onGrab,
    result: props.result,
  });

  return (
    <TableRow className="group border-b border-border transition-colors hover:bg-muted data-[state=selected]:bg-muted">
      <TableCell className="pl-6 py-2.5 max-w-[200px] sm:max-w-[300px] md:max-w-[400px]">
        <ReleasePrimaryCell
          title={props.result.title}
          sourceUrl={props.result.view_url}
          useTooltip
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
        {props.result.parsed_episode ? (
          <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded-none">
            {props.result.parsed_episode}
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
        <Popover open={state.popoverOpen} onOpenChange={state.setPopoverOpen}>
          <PopoverTrigger render={<div />}>
            <Button
              size="icon"
              variant="ghost"
              className="relative after:absolute after:-inset-2 h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-primary/10 hover:text-primary"
              aria-label="Download release"
            >
              <DownloadIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3">
            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="text-xs font-semibold text-foreground">Confirm Download</h4>
                <p className="text-xs text-muted-foreground">
                  {state.isBatch
                    ? "Verify the starting episode used for the batch mapping."
                    : "Verify episode number for mapping."}
                </p>
                {state.selectionSummary && (
                  <ReleaseSelectionMeta
                    selectionKind={state.selectionMetadata.selection_kind}
                    selectionLabel={state.selectionLabel}
                    selectionSummary={state.selectionSummary}
                  />
                )}
                <p className="text-xs text-muted-foreground line-clamp-2">
                  Decision and source metadata are resolved server-side at queue time.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`batch-${props.result.info_hash}`}
                  checked={state.isBatch}
                  onCheckedChange={state.setIsBatch}
                />
                <Label htmlFor={`batch-${props.result.info_hash}`} className="text-xs">
                  Batch / Season Pack
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    value={state.episodeNumberInput}
                    onChange={(event) => state.setEpisodeNumberInput(event.currentTarget.value)}
                    className="h-7 text-xs font-mono"
                    placeholder={state.isBatch ? "Start ep" : "Ep #"}
                  />
                </div>
                <Button
                  size="sm"
                  onClick={state.handleGrab}
                  disabled={
                    state.grabMutation.isPending || (!state.isBatch && !state.episodeNumberInput)
                  }
                  className="h-7 px-3 text-xs"
                >
                  {state.grabMutation.isPending ? (
                    <SpinnerIcon className="h-3 w-3 animate-spin" />
                  ) : (
                    "Download"
                  )}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>
    </TableRow>
  );
}
