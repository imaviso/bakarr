import type { AnimeSearchResult } from "~/api/contracts";
import { ManualSearchCore } from "~/features/import/manual-search-core";

export function ManualMatchSearch(props: { onSelect: (anime: AnimeSearchResult) => void }) {
  return (
    <ManualSearchCore
      addedIndicator="badge"
      autoFocusInput={false}
      containerClass="h-[320px] border border-border bg-background"
      disableSelectionForAdded={false}
      emptyPrompt="Type at least 3 characters to search media"
      onSelect={props.onSelect}
    />
  );
}
