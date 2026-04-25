import { ManualSearchCore } from "./manual-search-core";
import type { ManualSearchProps } from "./types";

export function ManualSearch(props: ManualSearchProps) {
  return (
    <ManualSearchCore
      addedIndicator="text"
      disableSelectionForAdded
      emptyPrompt="Type to search for anime"
      existingIds={props.existingIds}
      onSelect={props.onSelect}
    />
  );
}
