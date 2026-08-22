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
  const lastRequestedLength = useRef(-1);
  const { hasNextPage, isFetchingNextPage, total, threshold, lastIndex, fetchNextPage } = options;

  useEffect(() => {
    if (!hasNextPage) {
      lastRequestedLength.current = -1;
      return;
    }

    if (lastIndex < 0) {
      return;
    }

    if (
      lastIndex >= total - threshold &&
      lastRequestedLength.current !== total &&
      !isFetchingNextPage
    ) {
      lastRequestedLength.current = total;
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, total, threshold, lastIndex, fetchNextPage]);
}
