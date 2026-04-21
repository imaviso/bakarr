import { FolderIcon } from "@phosphor-icons/react";

export function EmptyScanState(props: { hasOutstandingMatches: boolean; isScanning: boolean }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center border border-dashed border-border/70 bg-background/60 px-6 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center border border-info/20 bg-info/10">
        <FolderIcon className="h-8 w-8 text-info" />
      </div>
      <p className="mt-5 text-base font-medium text-foreground">
        {props.isScanning || props.hasOutstandingMatches
          ? "Scanning for folders..."
          : "No unmapped folders found"}
      </p>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {props.isScanning || props.hasOutstandingMatches
          ? "We're checking your library root for folders that are not linked yet, then matching them in the background one by one."
          : "Everything under your library root is already mapped to anime entries."}
      </p>
    </div>
  );
}
