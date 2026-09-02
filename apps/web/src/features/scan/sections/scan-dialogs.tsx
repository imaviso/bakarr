import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManualMatchSearch } from "@/features/scan/manual-match-search";
import type { MediaSearchResult, UnmappedFolder } from "@/api/contracts";

interface ScanDialogsProps {
  confirmBulkAction: string | null;
  confirmBulkMeta: {
    actionLabel: string;
    description: string;
    title: string;
  } | null;
  onConfirmBulkAction: () => void;
  onCancelBulkAction: () => void;
  manualMatchDialog: {
    folder: UnmappedFolder;
    onSelect: (anime: MediaSearchResult) => void;
  } | null;
  onCloseManualMatch: () => void;
  onManualMatchSelect: (anime: MediaSearchResult) => void;
}

export function ScanDialogs(props: ScanDialogsProps) {
  return (
    <>
      <ConfirmDialog
        title={props.confirmBulkMeta?.title ?? ""}
        description={props.confirmBulkMeta?.description ?? ""}
        confirmLabel={props.confirmBulkMeta?.actionLabel ?? "Confirm"}
        destructive={props.confirmBulkAction === "reset_failed"}
        isOpen={props.confirmBulkAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            props.onCancelBulkAction();
          }
        }}
        onConfirm={props.onConfirmBulkAction}
      />

      <Dialog
        isOpen={props.manualMatchDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            props.onCloseManualMatch();
          }
        }}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Match folder to anime</DialogTitle>
          <DialogDescription>
            Search for the anime to associate with{" "}
            <span className="font-mono text-xs">{props.manualMatchDialog?.folder.name ?? ""}</span>
          </DialogDescription>
        </DialogHeader>
        <ManualMatchSearch
          key={props.manualMatchDialog?.folder.path ?? "closed"}
          initialMediaKind={props.manualMatchDialog?.folder.media_kind}
          onSelect={props.onManualMatchSelect}
        />
      </Dialog>
    </>
  );
}
