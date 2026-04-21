import { useEffect, useMemo, useState } from "react";
import {
  createGrabReleaseMutation,
  createNyaaSearchQuery,
  SEARCH_RELEASE_CATEGORY_LABELS,
  SEARCH_RELEASE_FILTER_LABELS,
  type NyaaSearchResult,
} from "~/lib/api";
import { createDebouncer } from "~/lib/debounce";
import { buildReleaseDisplay, buildSelectionDisplayFromNyaaResult } from "~/lib/release-display";
import { getReleaseConfidence } from "~/lib/release-selection";
import { buildGrabInputFromNyaaResult } from "~/lib/release-grab";

export const CATEGORY_LABELS: Record<string, string> = SEARCH_RELEASE_CATEGORY_LABELS;

export const FILTER_LABELS: Record<string, string> = SEARCH_RELEASE_FILTER_LABELS;

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(defaultQuery);
  const [category, setCategory] = useState<string>("all_anime");
  const [filter, setFilter] = useState<string>("no_filter");
  const debouncer = useMemo(() => createDebouncer(setDebouncedQuery, 500), []);

  useEffect(() => {
    debouncer.schedule(query);
    return () => debouncer.cancel();
  }, [query, debouncer]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const nextQuery = defaultQuery;
    setQuery(nextQuery);
    setDebouncedQuery(nextQuery);
  }, [open, defaultQuery]);

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
  const [sortCol, setSortCol] = useState<keyof NyaaSearchResult>("pub_date");
  const [sortAsc, setSortAsc] = useState(false);

  const searchQuery = createNyaaSearchQuery(input.query, {
    animeId: input.animeId,
    category: input.category,
    filter: input.filter,
  });

  const results = useMemo(() => searchQuery.data?.results ?? [], [searchQuery.data]);

  const sortedResults = useMemo(() => {
    const list = [...results];
    return list.toSorted((left, right) => {
      const column = sortCol;

      if (column === "pub_date") {
        const leftDate = Date.parse(left.pub_date);
        const rightDate = Date.parse(right.pub_date);

        if (Number.isNaN(leftDate) || Number.isNaN(rightDate)) {
          return sortAsc
            ? left.pub_date.localeCompare(right.pub_date)
            : right.pub_date.localeCompare(left.pub_date);
        }

        return sortAsc ? leftDate - rightDate : rightDate - leftDate;
      }

      const leftValue = left[column];
      const rightValue = right[column];

      if (leftValue === undefined && rightValue === undefined) return 0;
      if (leftValue === undefined) return 1;
      if (rightValue === undefined) return -1;

      if (leftValue < rightValue) return sortAsc ? -1 : 1;
      if (leftValue > rightValue) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [results, sortCol, sortAsc]);

  const toggleSort = (column: keyof NyaaSearchResult) => {
    if (sortCol === column) {
      setSortAsc(!sortAsc);
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
  const [episodeNumberInput, setEpisodeNumberInput] = useState(
    input.result.parsed_episode?.toString() ||
      input.result.parsed_episode_numbers?.[0]?.toString() ||
      (detectedIsBatch ? "1" : ""),
  );
  const [isBatch, setIsBatch] = useState(detectedIsBatch);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const selectionDisplay = useMemo(
    () => buildSelectionDisplayFromNyaaResult(input.result),
    [input.result],
  );
  const releaseDisplay = useMemo(
    () =>
      buildReleaseDisplay({
        group: input.result.parsed_group,
        indexer: input.result.indexer,
        is_seadex: input.result.is_seadex,
        is_seadex_best: input.result.is_seadex_best,
        parsed_air_date: input.result.parsed_air_date,
        parsed_episode_label: input.result.parsed_episode_label,
        quality: input.result.parsed_quality,
        remake: input.result.remake,
        resolution: input.result.parsed_resolution,
        seadex_dual_audio: input.result.seadex_dual_audio,
        trusted: input.result.trusted,
      }),
    [input.result],
  );
  const grabPayload = useMemo(() => {
    const parsedEpisodeNumber = parseFloat(episodeNumberInput);
    const episodeNumber = Number.isFinite(parsedEpisodeNumber) ? parsedEpisodeNumber : undefined;

    return buildGrabInputFromNyaaResult({
      animeId: input.animeId,
      episodeNumber,
      isBatch: isBatch,
      result: input.result,
    });
  }, [episodeNumberInput, isBatch, input.animeId, input.result]);
  const selectionMetadata = useMemo(() => selectionDisplay.metadata, [selectionDisplay]);
  const selectionSummary = useMemo(() => selectionDisplay.summary, [selectionDisplay]);
  const selectionLabel = useMemo(() => selectionDisplay.label, [selectionDisplay]);
  const releaseConfidence = useMemo(
    () => getReleaseConfidence(releaseDisplay.confidence),
    [releaseDisplay],
  );
  const releaseFlags = useMemo(() => releaseDisplay.flags, [releaseDisplay]);
  const releaseSourceSummary = useMemo(() => releaseDisplay.sourceSummary, [releaseDisplay]);
  const releaseParsedSummary = useMemo(() => releaseDisplay.parsedSummary, [releaseDisplay]);

  const handleGrab = () => {
    grabMutation.mutate(grabPayload, {
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
