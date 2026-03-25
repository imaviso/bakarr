import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconExternalLink,
  IconFilter,
  IconLoader2,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconStarFilled,
} from "@tabler/icons-solidjs";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
  Suspense,
} from "solid-js";
import { Badge } from "~/components/ui/badge";
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
import { ReleaseMetadataSummary } from "~/components/release-metadata-summary";
import {
  createGrabReleaseMutation,
  createNyaaSearchQuery,
  type NyaaSearchResult,
  type ParsedEpisodeIdentity,
} from "~/lib/api";
import {
  formatReleaseParsedSummary,
  formatReleaseSourceSummary,
  getReleaseFlags,
} from "~/lib/release-metadata";
import {
  formatSelectionSummary,
  getReleaseConfidence,
  releaseConfidenceBadgeClass,
  selectionKindBadgeClass,
  selectionKindLabel,
} from "~/lib/release-selection";
import { cn } from "~/lib/utils";

interface SearchDialogProps {
  trigger?: JSX.Element;
  animeId: number;
  defaultQuery: string;
  tooltip?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  anime_english: "Anime (English)",
  anime_non_english: "Anime (Non-Eng)",
  anime_raw: "Anime (Raw)",
  all_anime: "All Anime",
};

const FILTER_LABELS: Record<string, string> = {
  no_filter: "No Filter",
  no_remakes: "No Remakes",
  trusted_only: "Trusted Only",
};

export function SearchDialog(props: SearchDialogProps) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal(props.defaultQuery);
  const [debouncedQuery, setDebouncedQuery] = createSignal(props.defaultQuery);
  const [category, setCategory] = createSignal<string>("all_anime");
  const [filter, setFilter] = createSignal<string>("no_filter");

  createEffect(() => {
    const q = query();
    const timeout = setTimeout(() => setDebouncedQuery(q), 500);
    onCleanup(() => clearTimeout(timeout));
  });

  createEffect(() => {
    if (open()) {
      setQuery(props.defaultQuery);
      setDebouncedQuery(props.defaultQuery);
    }
  });

  return (
    <Dialog open={open()} onOpenChange={setOpen}>
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
            <TextField class="flex-1" value={query()} onChange={setQuery}>
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
              value={category()}
              onChange={setCategory}
              options={Object.keys(CATEGORY_LABELS)}
              itemComponent={(props) => (
                <SelectItem item={props.item}>{CATEGORY_LABELS[props.item.rawValue]}</SelectItem>
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
              value={filter()}
              onChange={setFilter}
              options={Object.keys(FILTER_LABELS)}
              itemComponent={(props) => (
                <SelectItem item={props.item}>{FILTER_LABELS[props.item.rawValue]}</SelectItem>
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
            <Show when={open()}>
              <SearchResults
                animeId={props.animeId}
                query={debouncedQuery()}
                category={category()}
                filter={filter()}
                onGrab={() => setOpen(false)}
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
  const [sortCol, setSortCol] = createSignal<keyof NyaaSearchResult>("pub_date");
  const [sortAsc, setSortAsc] = createSignal(false);

  const searchQuery = createNyaaSearchQuery(() => props.query, {
    anime_id: () => props.animeId,
    category: () => props.category,
    filter: () => props.filter,
  });

  const results = () => searchQuery.data?.results || [];

  const sortedResults = createMemo(() => {
    const list = [...results()];
    return list.sort((a, b) => {
      const col = sortCol();

      if (col === "pub_date") {
        const aDate = Date.parse(a.pub_date);
        const bDate = Date.parse(b.pub_date);
        if (Number.isNaN(aDate) || Number.isNaN(bDate)) {
          return sortAsc()
            ? a.pub_date.localeCompare(b.pub_date)
            : b.pub_date.localeCompare(a.pub_date);
        }
        return sortAsc() ? aDate - bDate : bDate - aDate;
      }

      const aVal = a[col];
      const bVal = b[col];

      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;

      if (aVal < bVal) return sortAsc() ? -1 : 1;
      if (aVal > bVal) return sortAsc() ? 1 : -1;
      return 0;
    });
  });

  const toggleSort = (col: keyof NyaaSearchResult) => {
    if (sortCol() === col) {
      setSortAsc(!sortAsc());
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  return (
    <div class="h-full overflow-auto">
      <Table>
        <TableHeader class="sticky top-0 bg-background z-10 border-b border-border/40 shadow-sm">
          <TableRow class="hover:bg-transparent border-border/40">
            <TableHead class="w-[45%] pl-6 h-9 text-xs font-medium">
              Release ({results().length})
            </TableHead>
            <TableHead
              class="h-9 text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => toggleSort("parsed_episode")}
            >
              <div class="flex items-center gap-1">
                Ep
                <Show when={sortCol() === "parsed_episode"}>
                  <Show when={sortAsc()} fallback={<IconSortDescending class="h-3 w-3" />}>
                    <IconSortAscending class="h-3 w-3" />
                  </Show>
                </Show>
              </div>
            </TableHead>
            <TableHead class="h-9 text-xs font-medium">Res</TableHead>
            <TableHead
              class="h-9 text-xs font-medium cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => toggleSort("size")}
            >
              <div class="flex items-center gap-1">
                Size
                <Show when={sortCol() === "size"}>
                  <Show when={sortAsc()} fallback={<IconSortDescending class="h-3 w-3" />}>
                    <IconSortAscending class="h-3 w-3" />
                  </Show>
                </Show>
              </div>
            </TableHead>
            <TableHead
              class="h-9 text-xs font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => toggleSort("seeders")}
            >
              <div class="flex items-center justify-end gap-1">
                Seeds
                <Show when={sortCol() === "seeders"}>
                  <Show when={sortAsc()} fallback={<IconSortDescending class="h-3 w-3" />}>
                    <IconSortAscending class="h-3 w-3" />
                  </Show>
                </Show>
              </div>
            </TableHead>
            <TableHead
              class="h-9 text-xs font-medium text-right cursor-pointer hover:text-foreground transition-colors select-none"
              onClick={() => toggleSort("pub_date")}
            >
              <div class="flex items-center justify-end gap-1">
                Age
                <Show when={sortCol() === "pub_date"}>
                  <Show when={sortAsc()} fallback={<IconSortDescending class="h-3 w-3" />}>
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
            when={sortedResults().length > 0}
            fallback={
              <TableRow class="hover:bg-transparent">
                <TableCell colSpan={7} class="h-48 text-center">
                  <div class="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <IconSearch class="h-8 w-8 opacity-20" />
                    <p class="text-sm">
                      {searchQuery.isError ? "Failed to load results" : "No results found"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            }
          >
            <For each={sortedResults()}>
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
  const grabMutation = createGrabReleaseMutation();
  const detectedIsBatch = () =>
    (props.result.parsed_episode_numbers?.length ?? 0) > 1 || !props.result.parsed_episode;
  const [epNum, setEpNum] = createSignal(
    props.result.parsed_episode?.toString() ||
      props.result.parsed_episode_numbers?.[0]?.toString() ||
      (detectedIsBatch() ? "1" : ""),
  );
  const [isBatch, setIsBatch] = createSignal(detectedIsBatch());
  const [popoverOpen, setPopoverOpen] = createSignal(false);

  const decisionReason = () => {
    if (props.result.is_seadex_best) {
      return "SeaDex Best release";
    }
    if (props.result.is_seadex) {
      return "SeaDex recommended release";
    }
    if (props.result.trusted) {
      return "Manual grab from trusted release search";
    }
    return "Manual grab from release search";
  };

  const selectionMetadata = (): {
    chosen_from_seadex?: boolean;
    selection_kind: "manual" | "accept";
  } => {
    if (props.result.is_seadex_best || props.result.is_seadex) {
      return {
        chosen_from_seadex: true,
        selection_kind: "accept",
      };
    }

    return { selection_kind: "manual" };
  };

  const handleGrab = () => {
    const selection = selectionMetadata();
    const releaseSourceIdentity = (): ParsedEpisodeIdentity | undefined => {
      if (!props.result.parsed_episode_label) {
        return undefined;
      }

      if (props.result.parsed_air_date) {
        return {
          air_dates: [props.result.parsed_air_date],
          label: props.result.parsed_episode_label,
          scheme: "daily",
        };
      }

      if (props.result.parsed_episode_numbers?.length) {
        return {
          episode_numbers: props.result.parsed_episode_numbers,
          label: props.result.parsed_episode_label,
          scheme: "absolute",
        };
      }

      return undefined;
    };

    grabMutation.mutate(
      {
        anime_id: props.animeId,
        decision_reason: decisionReason(),
        magnet: props.result.magnet,
        episode_number: Number.isFinite(parseFloat(epNum())) ? parseFloat(epNum()) : undefined,
        group: props.result.parsed_group,
        info_hash: props.result.info_hash,
        release_metadata: {
          air_date: props.result.parsed_air_date,
          chosen_from_seadex: selection.chosen_from_seadex,
          group: props.result.parsed_group,
          indexer: props.result.indexer,
          is_seadex: props.result.is_seadex,
          is_seadex_best: props.result.is_seadex_best,
          parsed_title: props.result.title,
          quality: props.result.parsed_quality,
          remake: props.result.remake,
          resolution: props.result.parsed_resolution,
          seadex_comparison: props.result.seadex_comparison,
          seadex_dual_audio: props.result.seadex_dual_audio,
          seadex_notes: props.result.seadex_notes,
          seadex_release_group: props.result.seadex_release_group,
          seadex_tags: props.result.seadex_tags,
          selection_kind: selection.selection_kind,
          source_identity: releaseSourceIdentity(),
          source_url: props.result.view_url,
          trusted: props.result.trusted,
        },
        title: props.result.title,
        is_batch: isBatch(),
      },
      {
        onSuccess: () => {
          setPopoverOpen(false);
          props.onGrab();
        },
      },
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  };

  const selectionSummary = () => formatSelectionSummary(selectionMetadata());
  const selectionLabel = () => selectionKindLabel(selectionMetadata().selection_kind);
  // selectionDetail is not yet implemented for Nyaa search results
  const releaseConfidence = () => getReleaseConfidence(props.result);
  const releaseFlags = () => getReleaseFlags(props.result);
  const releaseSourceSummary = () =>
    formatReleaseSourceSummary({
      group: props.result.parsed_group,
      indexer: props.result.indexer,
      quality: props.result.parsed_quality,
      resolution: props.result.parsed_resolution,
    });
  const releaseParsedSummary = () =>
    formatReleaseParsedSummary({
      parsed_air_date: props.result.parsed_air_date,
      parsed_episode_label: props.result.parsed_episode_label,
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
            flags={releaseFlags()}
            parsedSummary={releaseParsedSummary()}
            sourceSummary={releaseSourceSummary()}
            sourceUrl={props.result.view_url}
          />
          <Show
            when={
              props.result.seadex_notes ||
              props.result.seadex_tags?.length ||
              props.result.seadex_comparison
            }
          >
            <div class="flex flex-col gap-1 text-xs text-muted-foreground pr-4">
              <Show when={props.result.seadex_notes}>
                <span class="line-clamp-2">{props.result.seadex_notes}</span>
              </Show>
              <Show when={props.result.seadex_tags?.length}>
                <div class="flex flex-wrap gap-1">
                  <For each={(props.result.seadex_tags || []).slice(0, 4)}>
                    {(tag) => (
                      <Badge
                        variant="secondary"
                        class="h-4 px-1 text-xs bg-muted/40 text-muted-foreground border-transparent rounded-none"
                      >
                        {tag}
                      </Badge>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={props.result.seadex_comparison}>
                <a
                  href={props.result.seadex_comparison}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 w-fit"
                >
                  <IconExternalLink class="h-3 w-3" /> Compare notes
                </a>
              </Show>
            </div>
          </Show>
          <Show when={selectionSummary()}>
            <div class="flex flex-wrap items-center gap-1.5 text-xs pr-4 leading-tight">
              <Show when={selectionLabel()}>
                {(label) => (
                  <Badge
                    variant="secondary"
                    class={cn(
                      "h-4 px-1.5 border-transparent",
                      selectionKindBadgeClass(selectionMetadata().selection_kind),
                    )}
                  >
                    {label()}
                  </Badge>
                )}
              </Show>
            </div>
          </Show>
          <Show when={releaseConfidence()}>
            {(confidence) => (
              <div class="flex flex-wrap items-center gap-1.5 text-xs pr-4 leading-tight">
                <Badge
                  variant="secondary"
                  class={cn(
                    "h-4 px-1.5 border-transparent",
                    releaseConfidenceBadgeClass(confidence().tone),
                  )}
                >
                  {confidence().label}
                </Badge>
                <div class="text-muted-foreground">{confidence().reason}</div>
              </div>
            )}
          </Show>
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
        {formatDate(props.result.pub_date)}
      </TableCell>
      <TableCell class="py-2.5 pr-4">
        <Popover open={popoverOpen()} onOpenChange={setPopoverOpen}>
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
                  {isBatch()
                    ? "Verify the starting episode used for the batch mapping."
                    : "Verify episode number for mapping."}
                </p>
                <Show when={selectionSummary()}>
                  <div class="flex flex-wrap items-center gap-1.5 text-xs leading-tight">
                    <Show when={selectionLabel()}>
                      {(label) => (
                        <Badge
                          variant="secondary"
                          class={cn(
                            "h-4 px-1.5 border-transparent",
                            selectionKindBadgeClass(selectionMetadata().selection_kind),
                          )}
                        >
                          {label()}
                        </Badge>
                      )}
                    </Show>
                  </div>
                </Show>
                <p class="text-xs text-muted-foreground line-clamp-2">{decisionReason()}</p>
              </div>
              <div class="flex items-center space-x-2">
                <Checkbox
                  id={`batch-${props.result.info_hash}`}
                  checked={isBatch()}
                  onChange={setIsBatch}
                />
                <Label for={`batch-${props.result.info_hash}`} class="text-xs">
                  Batch / Season Pack
                </Label>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex-1">
                  <TextField value={epNum()} onChange={setEpNum}>
                    <TextFieldInput
                      class="h-7 text-xs font-mono"
                      placeholder={isBatch() ? "Start ep" : "Ep #"}
                    />
                  </TextField>
                </div>
                <Button
                  size="sm"
                  onClick={handleGrab}
                  disabled={grabMutation.isPending || (!isBatch() && !epNum())}
                  class="h-7 px-3 text-xs"
                >
                  <Show
                    when={!grabMutation.isPending}
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
