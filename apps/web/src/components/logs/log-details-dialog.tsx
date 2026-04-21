import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import type { SystemLog } from "~/lib/api";

interface LogDetailsDialogProps {
  log: SystemLog | null;
  formatTimestamp: (createdAt: string) => string;
  onOpenChange: (open: boolean) => void;
}

export function LogDetailsDialog(props: LogDetailsDialogProps) {
  return (
    <Dialog open={!!props.log} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Log Details</DialogTitle>
          <DialogDescription>
            {props.log && props.formatTimestamp(props.log.created_at || "")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto space-y-4 py-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
