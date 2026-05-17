import {
  CheckIcon,
  PauseIcon,
  PlayIcon,
  ArrowClockwiseIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { DownloadEventsDialog } from "~/features/downloads/download-events-dialog";
import { Button } from "~/components/ui/button";
import {
  useDeleteDownloadMutation,
  usePauseDownloadMutation,
  useReconcileDownloadMutation,
  useResumeDownloadMutation,
  useRetryDownloadMutation,
} from "~/api/system-downloads";
import { formatDateTime } from "~/domain/date-time";

interface ActiveDownloadActionsProps {
  allowedActions?: readonly string[] | undefined;
  downloadId?: number | undefined;
  mediaTitle?: string | undefined;
}

export function ActiveDownloadActions(props: ActiveDownloadActionsProps) {
  const pauseDownload = usePauseDownloadMutation();
  const resumeDownload = useResumeDownloadMutation();
  const retryDownload = useRetryDownloadMutation();
  const allowedActions = props.allowedActions ?? [];

  const handlePause = () => {
    if (!props.downloadId) {
      return;
    }

    pauseDownload.mutate(props.downloadId);
  };

  const handleResume = () => {
    if (!props.downloadId) {
      return;
    }

    resumeDownload.mutate(props.downloadId);
  };

  const handleRetry = () => {
    if (!props.downloadId) {
      return;
    }

    retryDownload.mutate(props.downloadId);
  };

  const canPause = () => allowedActions.includes("pause");
  const canResume = () => allowedActions.includes("resume");
  const canRetry = () => allowedActions.includes("retry");

  return (
    <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {canResume() ? (
        <Button
          variant="ghost"
          size="icon"
          className="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Resume download"
          onClick={handleResume}
          disabled={!props.downloadId || resumeDownload.isPending}
        >
          <PlayIcon className="h-4 w-4" />
        </Button>
      ) : (
        canPause() && (
          <Button
            variant="ghost"
            size="icon"
            className="relative after:absolute after:-inset-2 h-7 w-7"
            aria-label="Pause download"
            onClick={handlePause}
            disabled={!props.downloadId || pauseDownload.isPending}
          >
            <PauseIcon className="h-4 w-4" />
          </Button>
        )
      )}
      <DownloadEventsDialog
        description="Timeline of queue, status, and import events for this download."
        {...(props.downloadId === undefined ? {} : { downloadId: props.downloadId })}
        formatTimestamp={(value) => formatDateTime(value)}
        title={`Download Events${props.mediaTitle ? ` - ${props.mediaTitle}` : ""}`}
        triggerLabel="View download events"
      />
      {canRetry() && (
        <Button
          variant="ghost"
          size="icon"
          className="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Retry download"
          onClick={handleRetry}
          disabled={!props.downloadId || retryDownload.isPending}
        >
          <ArrowClockwiseIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

interface HistoryDownloadActionsProps {
  allowedActions?: readonly string[] | undefined;
  downloadId: number;
  mediaTitle: string;
}

export function HistoryDownloadActions(props: HistoryDownloadActionsProps) {
  const retryDownload = useRetryDownloadMutation();
  const reconcileDownload = useReconcileDownloadMutation();
  const deleteDownload = useDeleteDownloadMutation();
  const allowedActions = props.allowedActions ?? [];

  const handleRetry = () => {
    retryDownload.mutate(props.downloadId);
  };

  const handleDelete = () => {
    deleteDownload.mutate({ downloadId: props.downloadId });
  };

  const handleReconcile = () => {
    reconcileDownload.mutate(props.downloadId);
  };

  const canReconcile = () => allowedActions.includes("reconcile");
  const canRetry = () => allowedActions.includes("retry");
  const canDelete = () => allowedActions.includes("delete");

  return (
    <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <DownloadEventsDialog
        description="Timeline of queue, status, retry, and import events for this historical download."
        downloadId={props.downloadId}
        formatTimestamp={(value) => formatDateTime(value)}
        title={`Download Events - ${props.mediaTitle}`}
        triggerLabel="View download events"
      />
      {canReconcile() && (
        <Button
          variant="ghost"
          size="icon"
          className="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Mark as reconciled"
          onClick={handleReconcile}
          disabled={reconcileDownload.isPending}
        >
          <CheckIcon className="h-4 w-4" />
        </Button>
      )}
      {canRetry() && (
        <Button
          variant="ghost"
          size="icon"
          className="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Retry download"
          onClick={handleRetry}
          disabled={retryDownload.isPending}
        >
          <ArrowClockwiseIcon className="h-4 w-4" />
        </Button>
      )}
      {canDelete() && (
        <Button
          variant="ghost"
          size="icon"
          className="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Remove download"
          onClick={handleDelete}
          disabled={deleteDownload.isPending}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
