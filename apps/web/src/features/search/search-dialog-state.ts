import { differenceInDays, format, isValid, parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { useGrabReleaseMutation } from "~/api/media-mutations";
import { useNyaaSearchQuery } from "~/api/media";
import {
  SEARCH_RELEASE_CATEGORY_LABELS,
  SEARCH_RELEASE_FILTER_LABELS,
  type MediaKind,
  type NyaaSearchResult,
} from "~/api/contracts";
import { buildReleaseDisplay, buildSelectionDisplayFromNyaaResult } from "~/domain/release/display";
import { getReleaseConfidence } from "~/domain/release/selection";
import { buildGrabInputFromNyaaResult } from "~/domain/release/grab";

export const CATEGORY_LABELS: Record<string, string> = SEARCH_RELEASE_CATEGORY_LABELS;

export const FILTER_LABELS: Record<string, string> = SEARCH_RELEASE_FILTER_LABELS;

const SEARCH_DEBOUNCE_MS = 250;

export function formatSearchResultAge(dateStr: string) {
  const date = parseISO(dateStr);
  const now = new Date();
  const diffDays = differenceInDays(now, date);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return isValid(date) ? format(date, "MMM d, yy") : dateStr;
}

export function useSearchDialogState(defaultQuery: string, mediaKind: MediaKind) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery);
  const [debouncedQuery] = useDebouncedValue(query, { wait: SEARCH_DEBOUNCE_MS });
  const [category, setCategory] = useState<string>(
    mediaKind === "anime" ? "all_anime" : "all_literature",
  );
  const [filter, setFilter] = useState<string>("no_filter");

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
  mediaId: number;
  category: string;
  filter: string;
  query: string;
}) {
  const [sortCol, setSortCol] = useState<keyof NyaaSearchResult>("pub_date");
  const [sortAsc, setSortAsc] = useState(false);

  const searchQuery = useNyaaSearchQuery(input.query, {
    mediaId: input.mediaId,
    category: input.category,
    filter: input.filter,
  });

  const sortedResults = useMemo(() => {
    const list = [...(searchQuery.data?.results ?? [])];
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
  }, [searchQuery.data?.results, sortCol, sortAsc]);

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
  mediaId: number;
  onGrab: () => void;
  result: NyaaSearchResult;
}) {
  const grabMutation = useGrabReleaseMutation();
  const detectedIsBatch =
    (input.result.parsed_unit_numbers?.length ?? 0) > 1 || !input.result.parsed_unit;
  const [episodeNumberInput, setEpisodeNumberInput] = useState(
    input.result.parsed_unit?.toString() ||
      input.result.parsed_unit_numbers?.[0]?.toString() ||
      (detectedIsBatch ? "1" : ""),
  );
  const [isBatch, setIsBatch] = useState(detectedIsBatch);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const selectionDisplay = buildSelectionDisplayFromNyaaResult(input.result);
  const releaseDisplay = buildReleaseDisplay({
    group: input.result.parsed_group,
    indexer: input.result.indexer,
    is_seadex: input.result.is_seadex,
    is_seadex_best: input.result.is_seadex_best,
    parsed_air_date: input.result.parsed_air_date,
    parsed_unit_label: input.result.parsed_unit_label,
    quality: input.result.parsed_quality,
    remake: input.result.remake,
    resolution: input.result.parsed_resolution,
    seadex_dual_audio: input.result.seadex_dual_audio,
    trusted: input.result.trusted,
  });

  const parsedEpisodeNumber = parseFloat(episodeNumberInput);
  const unitNumber = Number.isFinite(parsedEpisodeNumber) ? parsedEpisodeNumber : undefined;

  const grabPayload = buildGrabInputFromNyaaResult({
    mediaId: input.mediaId,
    unitNumber,
    isBatch,
    result: input.result,
  });

  const releaseConfidence = getReleaseConfidence(releaseDisplay.confidence);
  const releaseFlags = releaseDisplay.flags;
  const releaseParsedSummary = releaseDisplay.parsedSummary;
  const releaseSourceSummary = releaseDisplay.sourceSummary;
  const selectionLabel = selectionDisplay.label;
  const selectionMetadata = selectionDisplay.metadata;
  const selectionSummary = selectionDisplay.summary;

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
