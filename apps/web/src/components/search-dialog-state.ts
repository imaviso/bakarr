import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { createGrabReleaseMutation, createNyaaSearchQuery, type NyaaSearchResult } from "~/lib/api";
import {
  formatReleaseParsedSummary,
  formatReleaseSourceSummary,
  getReleaseFlags,
} from "~/lib/release-metadata";
import {
  formatSelectionSummary,
  getReleaseConfidence,
  selectionKindLabel,
} from "~/lib/release-selection";
import { createDebouncer } from "~/lib/debounce";
import { buildGrabInputFromNyaaResult, selectionMetadataFromNyaaResult } from "~/lib/release-grab";

export const CATEGORY_LABELS: Record<string, string> = {
  anime_english: "Anime (English)",
  anime_non_english: "Anime (Non-Eng)",
  anime_raw: "Anime (Raw)",
  all_anime: "All Anime",
};

export const FILTER_LABELS: Record<string, string> = {
  no_filter: "No Filter",
  no_remakes: "No Remakes",
  trusted_only: "Trusted Only",
};

export function formatSearchResultAge(dateStr: string) {
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
}

export function useSearchDialogState(defaultQuery: string) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal(defaultQuery);
  const [debouncedQuery, setDebouncedQuery] = createSignal(defaultQuery);
  const [category, setCategory] = createSignal<string>("all_anime");
  const [filter, setFilter] = createSignal<string>("no_filter");
  const debouncer = createDebouncer(setDebouncedQuery, 500);

  createEffect(() => {
    debouncer.schedule(query());
  });

  onCleanup(() => debouncer.cancel());

  createEffect(() => {
    if (!open()) {
      return;
    }

    setQuery(defaultQuery);
    setDebouncedQuery(defaultQuery);
  });

  return {
    category,
    debouncedQuery,
    filter,
    open,
    query,
    setCategory,
    setFilter,
    setOpen,
    setQuery,
  };
}

export function useSearchDialogResultsState(input: {
  animeId: number;
  category: string;
  filter: string;
  query: string;
}) {
  const [sortCol, setSortCol] = createSignal<keyof NyaaSearchResult>("pub_date");
  const [sortAsc, setSortAsc] = createSignal(false);

  const searchQuery = createNyaaSearchQuery(() => input.query, {
    animeId: () => input.animeId,
    category: () => input.category,
    filter: () => input.filter,
  });

  const results = createMemo(() => searchQuery.data?.results ?? []);

  const sortedResults = createMemo(() => {
    const list = [...results()];
    return list.toSorted((left, right) => {
      const column = sortCol();

      if (column === "pub_date") {
        const leftDate = Date.parse(left.pub_date);
        const rightDate = Date.parse(right.pub_date);

        if (Number.isNaN(leftDate) || Number.isNaN(rightDate)) {
          return sortAsc()
            ? left.pub_date.localeCompare(right.pub_date)
            : right.pub_date.localeCompare(left.pub_date);
        }

        return sortAsc() ? leftDate - rightDate : rightDate - leftDate;
      }

      const leftValue = left[column];
      const rightValue = right[column];

      if (leftValue === undefined && rightValue === undefined) return 0;
      if (leftValue === undefined) return 1;
      if (rightValue === undefined) return -1;

      if (leftValue < rightValue) return sortAsc() ? -1 : 1;
      if (leftValue > rightValue) return sortAsc() ? 1 : -1;
      return 0;
    });
  });

  const toggleSort = (column: keyof NyaaSearchResult) => {
    if (sortCol() === column) {
      setSortAsc(!sortAsc());
      return;
    }

    setSortCol(column);
    setSortAsc(false);
  };

  return {
    searchQuery,
    sortAsc,
    sortCol,
    sortedResults,
    toggleSort,
  };
}

export function useSearchDialogReleaseRowState(input: {
  animeId: number;
  onGrab: () => void;
  result: NyaaSearchResult;
}) {
  const grabMutation = createGrabReleaseMutation();
  const detectedIsBatch =
    (input.result.parsed_episode_numbers?.length ?? 0) > 1 || !input.result.parsed_episode;
  const [episodeNumberInput, setEpisodeNumberInput] = createSignal(
    input.result.parsed_episode?.toString() ||
      input.result.parsed_episode_numbers?.[0]?.toString() ||
      (detectedIsBatch ? "1" : ""),
  );
  const [isBatch, setIsBatch] = createSignal(detectedIsBatch);
  const [popoverOpen, setPopoverOpen] = createSignal(false);

  const selectionMetadata = createMemo(() => selectionMetadataFromNyaaResult(input.result));
  const grabPayload = createMemo(() => {
    const parsedEpisodeNumber = parseFloat(episodeNumberInput());
    const episodeNumber = Number.isFinite(parsedEpisodeNumber) ? parsedEpisodeNumber : undefined;

    return buildGrabInputFromNyaaResult({
      animeId: input.animeId,
      episodeNumber,
      isBatch: isBatch(),
      result: input.result,
    });
  });
  const selectionSummary = createMemo(() => formatSelectionSummary(selectionMetadata()));
  const selectionLabel = createMemo(() => selectionKindLabel(selectionMetadata().selection_kind));
  const releaseConfidence = createMemo(() => getReleaseConfidence(input.result));
  const releaseFlags = createMemo(() => getReleaseFlags(input.result));
  const releaseSourceSummary = createMemo(() =>
    formatReleaseSourceSummary({
      group: input.result.parsed_group,
      indexer: input.result.indexer,
      quality: input.result.parsed_quality,
      resolution: input.result.parsed_resolution,
    }),
  );
  const releaseParsedSummary = createMemo(() =>
    formatReleaseParsedSummary({
      parsed_air_date: input.result.parsed_air_date,
      parsed_episode_label: input.result.parsed_episode_label,
    }),
  );

  const handleGrab = () => {
    grabMutation.mutate(grabPayload(), {
      onSuccess: () => {
        setPopoverOpen(false);
        input.onGrab();
      },
    });
  };

  return {
    episodeNumberInput,
    grabMutation,
    grabPayload,
    handleGrab,
    isBatch,
    popoverOpen,
    releaseConfidence,
    releaseFlags,
    releaseParsedSummary,
    releaseSourceSummary,
    selectionLabel,
    selectionMetadata,
    selectionSummary,
    setEpisodeNumberInput,
    setIsBatch,
    setPopoverOpen,
  };
}
