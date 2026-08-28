import { useEffect, useRef } from "react";

interface UseInfiniteNearEndOptions {
  /** Whether another page can be fetched at all. */
  readonly hasNextPage: boolean;
  /** True while a page fetch is already in flight. */
  readonly isFetchingNextPage: boolean;
  /** Total rendered rows so far. */
  readonly total: number;
  /** Fetch when the last visible row index reaches total - threshold. */
  readonly threshold: number;
  /** Index of the last currently-visible virtual row (-1 when none). */
  readonly lastIndex: number;
  readonly fetchNextPage: () => void;
}

/**
 * Shared virtualizer sentinel: triggers `fetchNextPage` once when scrolling
 * nears the end of the rendered list. Guards against duplicate requests per
 * page length.
 */
export function useInfiniteNearEnd(options: UseInfiniteNearEndOptions) {
  const lastRequested = useRef({ total: -1, lastIndex: -1 });
  const { hasNextPage, isFetchingNextPage, total, threshold, lastIndex, fetchNextPage } = options;

  useEffect(() => {
    if (!hasNextPage) {
      lastRequested.current = { total: -1, lastIndex: -1 };
      return;
    }

    if (lastIndex < 0) {
      return;
    }

    // A failed page fetch never grows `total`, so a retry for the same total
    // is only issued once the visible window has moved — retries stay bounded
    // by actual scrolling instead of looping while the last row is in view.
    const requested = lastRequested.current;
    const alreadyRequested = requested.total === total && requested.lastIndex === lastIndex;

    if (lastIndex >= total - threshold && !alreadyRequested && !isFetchingNextPage) {
      lastRequested.current = { total, lastIndex };
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, total, threshold, lastIndex, fetchNextPage]);
}
