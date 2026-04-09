import { Show } from "solid-js";
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
      <DialogContent class="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Log Details</DialogTitle>
          <DialogDescription>
            {props.log && props.formatTimestamp(props.log.created_at || "")}
          </DialogDescription>
        </DialogHeader>
        <div class="flex-1 overflow-auto space-y-4 py-4">
          <div class="space-y-1">
            <div class="text-sm font-medium text-muted-foreground">Message</div>
            <div class="p-3 rounded-md bg-muted text-sm font-mono whitespace-pre-wrap break-words">
              {props.log?.message}
            </div>
          </div>
          <Show when={props.log?.details}>
            <div class="space-y-1">
              <div class="text-sm font-medium text-muted-foreground">Details</div>
              <div class="p-3 rounded-md bg-muted text-xs font-mono whitespace-pre-wrap break-words">
                {props.log?.details}
              </div>
            </div>
          </Show>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="flex gap-1 items-baseline">
              <span class="text-muted-foreground">Level:</span>
              <span class="capitalize font-medium">{props.log?.level}</span>
            </div>
            <div class="flex gap-1 items-baseline">
              <span class="text-muted-foreground">Source:</span>
              <span class="capitalize font-medium">{props.log?.event_type}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
