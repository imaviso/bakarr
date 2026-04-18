import type { AnimeSearchResult } from "~/lib/api";
import { ManualSearchCore } from "~/components/import/manual-search-core";

export function ManualMatchSearch(props: { onSelect: (anime: AnimeSearchResult) => void }) {
  return (
    <ManualSearchCore
      addedIndicator="badge"
      autoFocusInput={false}
      containerClass="h-[320px] border border-border/70 bg-background"
      disableSelectionForAdded={false}
      emptyPrompt="Type at least 3 characters to search"
      onSelect={props.onSelect}
    />
  );
}
