import type { MediaKind, MediaSearchResult } from "~/api/contracts";
import { ManualSearchCore } from "~/features/import/manual-search-core";

export function ManualMatchSearch(props: {
  initialMediaKind?: MediaKind | undefined;
  onSelect: (anime: MediaSearchResult) => void;
}) {
  return (
    <ManualSearchCore
      addedIndicator="badge"
      autoFocusInput={false}
      containerClass="h-[320px] border border-border bg-background"
      disableSelectionForAdded={false}
      emptyPrompt="Type at least 3 characters to search media"
      initialMediaKind={props.initialMediaKind}
      onSelect={props.onSelect}
    />
  );
}
