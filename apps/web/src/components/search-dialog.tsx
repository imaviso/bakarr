import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconFilter,
  IconLoader2,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconStarFilled,
} from "@tabler/icons-solidjs";
import { For, type JSX, Show, Suspense } from "solid-js";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
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
import { TextField, TextFieldInput } from "~/components/ui/text-field";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { ReleaseSeaDexMeta, ReleaseSelectionMeta } from "~/components/release-search/release-meta";
import { ReleaseMetadataSummary } from "~/components/release-metadata-summary";
import type { NyaaSearchResult } from "~/lib/api";
import {
  CATEGORY_LABELS,
  FILTER_LABELS,
  formatSearchResultAge,
  useSearchDialogReleaseRowState,
  useSearchDialogResultsState,
  useSearchDialogState,
} from "~/components/search-dialog-state";
import { cn } from "~/lib/utils";

interface SearchDialogProps {
  trigger?: JSX.Element;
  animeId: number;
  defaultQuery: string;
  tooltip?: string;
}

export function SearchDialog(props: SearchDialogProps) {
  const state = useSearchDialogState(props.defaultQuery);

  return (
    <Dialog open={state.open()} onOpenChange={state.setOpen}>
      <Show when={props.trigger}>
        <DialogTrigger as="div" class="contents">
          <Show when={props.tooltip} fallback={props.trigger}>
            <Tooltip>
              <TooltipTrigger>{props.trigger}</TooltipTrigger>
              <TooltipContent>{props.tooltip}</TooltipContent>
            </Tooltip>
          </Show>
        </DialogTrigger>
      </Show>

      <DialogContent class="sm:max-w-7xl w-full h-[85vh] flex flex-col p-0 gap-0 border-none sm:rounded-none bg-background/95 shadow-sm overflow-hidden">
        <DialogTitle class="sr-only">Search Releases</DialogTitle>

        {/* Header / Search Bar */}
        <div class="flex flex-col border-b border-border/40">
          <div class="flex items-center px-4 py-3 gap-3">
            <IconSearch class="h-5 w-5 text-muted-foreground shrink-0" />
            <TextField class="flex-1" value={state.query()} onChange={state.setQuery}>
              <TextFieldInput
                placeholder="Search for releases..."
                class="bg-transparent border-none shadow-none focus-visible:ring-0 text-lg px-0 h-9 placeholder:text-muted-foreground/50"
                autofocus
              />
            </TextField>
          </div>

          {/* Filter Bar */}
          <div class="flex items-center gap-2 px-4 pb-3 overflow-x-auto">
            <Select
              value={state.category()}
              onChange={state.setCategory}
              options={Object.keys(CATEGORY_LABELS)}
              itemComponent={(itemProps) => (
                <SelectItem item={itemProps.item}>
                  {CATEGORY_LABELS[itemProps.item.rawValue]}
                </SelectItem>
              )}
            >
              <SelectTrigger class="h-7 w-auto min-w-[130px] text-xs bg-muted/30 border-transparent hover:bg-muted/50 focus:ring-0 gap-2 rounded-none shadow-none px-2.5">
                <span class="text-muted-foreground">Category:</span>
                <SelectValue<string>>
                  {(state) => CATEGORY_LABELS[state.selectedOption()] || state.selectedOption()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>

            <Select
              value={state.filter()}
              onChange={state.setFilter}
              options={Object.keys(FILTER_LABELS)}
              itemComponent={(itemProps) => (
                <SelectItem item={itemProps.item}>
                  {FILTER_LABELS[itemProps.item.rawValue]}
                </SelectItem>
              )}
            >
              <SelectTrigger class="h-7 w-auto min-w-[120px] text-xs bg-muted/30 border-transparent hover:bg-muted/50 focus:ring-0 gap-2 rounded-none shadow-none px-2.5">
                <IconFilter class="h-3 w-3 text-muted-foreground" />
                <SelectValue<string>>
                  {(state) => FILTER_LABELS[state.selectedOption()] || state.selectedOption()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>
        </div>

        {/* Results Table */}
        <div class="flex-1 overflow-hidden relative bg-muted/5">
          <Suspense fallback={<SearchResultsSkeleton />}>
            <Show when={state.open()}>
              <SearchResults
                animeId={props.animeId}
                query={state.debouncedQuery()}
                category={state.category()}
                filter={state.filter()}
                onGrab={() => state.setOpen(false)}
              />
            </Show>
          </Suspense>
        </div>

        {/* Footer Legend */}
        <div class="px-6 py-2.5 border-t border-border/40 bg-background text-xs text-muted-foreground flex gap-6 items-center overflow-x-auto">
          <span class="flex items-center gap-1.5 whitespace-nowrap">
            <IconStarFilled class="h-3 w-3 text-success fill-success" /> Trusted
          </span>
          <span class="flex items-center gap-1.5 whitespace-nowrap">
            <IconCheck class="h-3 w-3 text-info fill-info" /> SeaDex
          </span>
          <span class="flex items-center gap-1.5 whitespace-nowrap">
            <IconCheck class="h-3 w-3 text-warning fill-warning" /> SeaDex Best
          </span>
          <span class="flex items-center gap-1.5 whitespace-nowrap">
            <IconAlertTriangle class="h-3 w-3 text-warning" /> Remake
          </span>
        </div>
      </DialogContent>
    </Dialog>
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
    <div class="h-full overflow-auto">
      <Table>
        <TableHeader class="sticky top-0 bg-background z-10 border-b border-border/40 shadow-sm">
          <TableRow class="hover:bg-transparent border-border/40">
            <TableHead class="w-[45%] pl-6 h-9 text-xs font-medium">
              Release ({state.searchQuery.data?.results.length ?? 0})
            </TableHead>
            <TableHead
              class="h-9 text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => state.toggleSort("parsed_episode")}
            >
              <div class="flex items-center gap-1">
                Ep
                <Show when={state.sortCol() === "parsed_episode"}>
                  <Show when={state.sortAsc()} fallback={<IconSortDescending class="h-3 w-3" />}>
                    <IconSortAscending class="h-3 w-3" />
                  </Show>
                </Show>
              </div>
            </TableHead>
            <TableHead class="h-9 text-xs font-medium">Res</TableHead>
            <TableHead
              class="h-9 text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => state.toggleSort("size")}
            >
              <div class="flex items-center gap-1">
                Size
                <Show when={state.sortCol() === "size"}>
                  <Show when={state.sortAsc()} fallback={<IconSortDescending class="h-3 w-3" />}>
                    <IconSortAscending class="h-3 w-3" />
                  </Show>
                </Show>
              </div>
            </TableHead>
            <TableHead
              class="h-9 text-xs font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => state.toggleSort("seeders")}
            >
              <div class="flex items-center justify-end gap-1">
                Seeds
                <Show when={state.sortCol() === "seeders"}>
                  <Show when={state.sortAsc()} fallback={<IconSortDescending class="h-3 w-3" />}>
                    <IconSortAscending class="h-3 w-3" />
                  </Show>
                </Show>
              </div>
            </TableHead>
            <TableHead
              class="h-9 text-xs font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => state.toggleSort("pub_date")}
            >
              <div class="flex items-center justify-end gap-1">
                Age
                <Show when={state.sortCol() === "pub_date"}>
                  <Show when={state.sortAsc()} fallback={<IconSortDescending class="h-3 w-3" />}>
                    <IconSortAscending class="h-3 w-3" />
                  </Show>
                </Show>
              </div>
            </TableHead>
            <TableHead class="w-[50px] h-9"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <Show
            when={state.sortedResults().length > 0}
            fallback={
              <TableRow class="hover:bg-transparent">
                <TableCell colSpan={7} class="h-48 text-center">
                  <div class="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <IconSearch class="h-8 w-8 opacity-20" />
                    <p class="text-sm">
                      {state.searchQuery.isError ? "Failed to load results" : "No results found"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            }
          >
            <For each={state.sortedResults()}>
              {(result) => (
                <ReleaseRow result={result} animeId={props.animeId} onGrab={props.onGrab} />
              )}
            </For>
          </Show>
        </TableBody>
      </Table>
    </div>
  );
}

function SearchResultsSkeleton() {
  return (
    <div class="h-full overflow-hidden flex flex-col">
      <Table>
        <TableHeader class="sticky top-0 bg-background z-10 border-b border-border/40 shadow-sm">
          <TableRow class="hover:bg-transparent border-border/40">
            <TableHead class="w-[45%] pl-6 h-9 text-xs font-medium">Release</TableHead>
            <TableHead class="h-9 text-xs font-medium">Ep</TableHead>
            <TableHead class="h-9 text-xs font-medium">Res</TableHead>
            <TableHead class="h-9 text-xs font-medium">Size</TableHead>
            <TableHead class="h-9 text-xs font-medium text-right">Seeds</TableHead>
            <TableHead class="h-9 text-xs font-medium text-right">Age</TableHead>
            <TableHead class="w-[50px] h-9"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <For each={Array(10).fill(0)}>
            {() => (
              <TableRow class="hover:bg-transparent border-border/40">
                <TableCell class="pl-6 py-2.5">
                  <div class="space-y-1.5">
                    <Skeleton class="h-4 w-3/4" />
                    <div class="flex gap-2">
                      <Skeleton class="h-3 w-12" />
                      <Skeleton class="h-3 w-8" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton class="h-4 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton class="h-4 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton class="h-4 w-12" />
                </TableCell>
                <TableCell class="text-right">
                  <Skeleton class="h-4 w-8 ml-auto" />
                </TableCell>
                <TableCell class="text-right">
                  <Skeleton class="h-4 w-16 ml-auto" />
                </TableCell>
                <TableCell>
                  <Skeleton class="h-7 w-7 rounded-none" />
                </TableCell>
              </TableRow>
            )}
          </For>
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
    <TableRow class="group border-b border-border/40 transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted">
      <TableCell class="pl-6 py-2.5 max-w-[200px] sm:max-w-[300px] md:max-w-[400px]">
        <div class="flex flex-col gap-1.5">
          <Tooltip>
            <TooltipTrigger>
              <a
                href={props.result.view_url}
                target="_blank"
                rel="noreferrer"
                class="text-sm font-medium leading-none text-foreground hover:text-primary transition-colors truncate block pr-4"
              >
                {props.result.title}
              </a>
            </TooltipTrigger>
            <TooltipContent class="max-w-[400px]">
              <p class="break-words font-normal">{props.result.title}</p>
            </TooltipContent>
          </Tooltip>
          <ReleaseMetadataSummary
            flags={state.releaseFlags()}
            parsedSummary={state.releaseParsedSummary()}
            sourceSummary={state.releaseSourceSummary()}
            sourceUrl={props.result.view_url}
          />
          <ReleaseSeaDexMeta
            notes={props.result.seadex_notes}
            tags={props.result.seadex_tags}
            comparisonUrl={props.result.seadex_comparison}
            class="pr-4"
            tagClass="rounded-none"
          />
          <ReleaseSelectionMeta
            selectionKind={state.selectionMetadata().selection_kind}
            selectionLabel={state.selectionLabel()}
            selectionSummary={state.selectionSummary()}
            confidence={state.releaseConfidence()}
            class="pr-4"
          />
        </div>
      </TableCell>
      <TableCell class="py-2.5">
        <Show
          when={props.result.parsed_episode}
          fallback={<span class="text-muted-foreground text-xs">-</span>}
        >
          <span class="font-mono text-xs text-foreground bg-muted/30 px-1.5 py-0.5 rounded-none">
            {props.result.parsed_episode}
          </span>
        </Show>
      </TableCell>
      <TableCell class="py-2.5 text-xs text-muted-foreground">
        <span title={props.result.parsed_quality || props.result.parsed_resolution}>
          {props.result.parsed_resolution || props.result.parsed_quality || "-"}
        </span>
      </TableCell>
      <TableCell class="py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        {props.result.size}
      </TableCell>
      <TableCell class="py-2.5 text-right">
        <div class="flex items-center justify-end gap-1.5 text-xs font-mono">
          <span
            class={cn(
              "font-medium",
              props.result.seeders > 0 ? "text-success dark:text-success" : "text-muted-foreground",
            )}
          >
            {props.result.seeders}
          </span>
          <span class="text-muted-foreground/30">/</span>
          <span class="text-muted-foreground">{props.result.leechers}</span>
        </div>
      </TableCell>
      <TableCell class="py-2.5 text-right text-xs text-muted-foreground whitespace-nowrap">
        {formatSearchResultAge(props.result.pub_date)}
      </TableCell>
      <TableCell class="py-2.5 pr-4">
        <Popover open={state.popoverOpen()} onOpenChange={state.setPopoverOpen}>
          <PopoverTrigger as="div">
            <Button
              size="icon"
              variant="ghost"
              class="relative after:absolute after:-inset-2 h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:bg-primary/10 hover:text-primary"
              aria-label="Download release"
            >
              <IconDownload class="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-64 p-3">
            <div class="space-y-3">
              <div class="space-y-1">
                <h4 class="text-xs font-semibold text-foreground">Confirm Download</h4>
                <p class="text-xs text-muted-foreground">
                  {state.isBatch()
                    ? "Verify the starting episode used for the batch mapping."
                    : "Verify episode number for mapping."}
                </p>
                <Show when={state.selectionSummary()}>
                  <ReleaseSelectionMeta
                    selectionKind={state.selectionMetadata().selection_kind}
                    selectionLabel={state.selectionLabel()}
                    selectionSummary={state.selectionSummary()}
                  />
                </Show>
                <p class="text-xs text-muted-foreground line-clamp-2">
                  {state.grabPayload().decisionReason}
                </p>
              </div>
              <div class="flex items-center space-x-2">
                <Checkbox
                  id={`batch-${props.result.info_hash}`}
                  checked={state.isBatch()}
                  onChange={state.setIsBatch}
                />
                <Label for={`batch-${props.result.info_hash}`} class="text-xs">
                  Batch / Season Pack
                </Label>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex-1">
                  <TextField
                    value={state.episodeNumberInput()}
                    onChange={state.setEpisodeNumberInput}
                  >
                    <TextFieldInput
                      class="h-7 text-xs font-mono"
                      placeholder={state.isBatch() ? "Start ep" : "Ep #"}
                    />
                  </TextField>
                </div>
                <Button
                  size="sm"
                  onClick={state.handleGrab}
                  disabled={
                    state.grabMutation.isPending ||
                    (!state.isBatch() && !state.episodeNumberInput())
                  }
                  class="h-7 px-3 text-xs"
                >
                  <Show
                    when={!state.grabMutation.isPending}
                    fallback={<IconLoader2 class="h-3 w-3 animate-spin" />}
                  >
                    Download
                  </Show>
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </TableCell>
    </TableRow>
  );
}
