import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ContentDialog,
  ContentDialogBody,
  ContentDialogHeader,
} from "@/components/shared/content-dialog";
import type { SystemLog } from "@/api/contracts";

interface LogDetailsDialogProps {
  log: SystemLog | null;
  formatTimestamp: (createdAt: string) => string;
  onOpenChange: (open: boolean) => void;
}

export function LogDetailsDialog(props: LogDetailsDialogProps) {
  return (
    <ContentDialog size="md" isOpen={!!props.log} onOpenChange={props.onOpenChange}>
      <ContentDialogHeader>
        <DialogTitle>Log Details</DialogTitle>
        <DialogDescription>
          {props.log && props.formatTimestamp(props.log.created_at || "")}
        </DialogDescription>
      </ContentDialogHeader>
      <ContentDialogBody className="space-y-4 p-4">
        <div className="space-y-1">
          <div className="text-sm font-medium text-muted-foreground">Message</div>
          <div className="p-3 rounded-none bg-muted text-sm font-mono whitespace-pre-wrap break-words">
            {props.log?.message}
          </div>
        </div>
        {props.log?.details && (
          <div className="space-y-1">
            <div className="text-sm font-medium text-muted-foreground">Details</div>
            <div className="p-3 rounded-none bg-muted text-xs font-mono whitespace-pre-wrap break-words">
              {props.log?.details}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex gap-1 items-baseline">
            <span className="text-muted-foreground">Level:</span>
            <span className="capitalize font-medium">{props.log?.level}</span>
          </div>
          <div className="flex gap-1 items-baseline">
            <span className="text-muted-foreground">Source:</span>
            <span className="capitalize font-medium">{props.log?.event_type}</span>
          </div>
        </div>
      </ContentDialogBody>
    </ContentDialog>
  );
}
