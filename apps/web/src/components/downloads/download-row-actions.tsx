import {
  CheckIcon,
  PauseIcon,
  PlayIcon,
  ArrowClockwiseIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { DownloadEventsDialog } from "~/components/download-events-dialog";
import { Button } from "~/components/ui/button";
import {
  createDeleteDownloadMutation,
  createPauseDownloadMutation,
  createReconcileDownloadMutation,
  createResumeDownloadMutation,
  createRetryDownloadMutation,
} from "~/lib/api";
import type { DownloadStatusPresentation } from "~/lib/download-status";

interface ActiveDownloadActionsProps {
  allowedActions?: readonly string[] | undefined;
  downloadId?: number | undefined;
  statusPresentation: DownloadStatusPresentation;
  animeTitle?: string | undefined;
}

export function ActiveDownloadActions(props: ActiveDownloadActionsProps) {
  const pauseDownload = createPauseDownloadMutation();
  const resumeDownload = createResumeDownloadMutation();
  const retryDownload = createRetryDownloadMutation();

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

  const canPause = () =>
    props.allowedActions?.includes("pause") ??
    !(
      props.statusPresentation.label.toLowerCase().includes("paused") ||
      props.statusPresentation.label.toLowerCase().includes("queued") ||
      props.statusPresentation.tone === "destructive"
    );
  const canResume = () =>
    props.allowedActions?.includes("resume") ??
    (props.statusPresentation.label.toLowerCase().includes("paused") ||
      props.statusPresentation.label.toLowerCase().includes("queued") ||
      props.statusPresentation.tone === "destructive");
  const canRetry = () =>
    props.allowedActions?.includes("retry") ?? props.statusPresentation.tone === "destructive";

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
        formatTimestamp={(value) => new Date(value).toLocaleString()}
        title={`Download Events${props.animeTitle ? ` - ${props.animeTitle}` : ""}`}
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
  animeTitle: string;
  status?: string | undefined;
  reconciledAt?: string | null | undefined;
}

export function HistoryDownloadActions(props: HistoryDownloadActionsProps) {
  const retryDownload = createRetryDownloadMutation();
  const reconcileDownload = createReconcileDownloadMutation();
  const deleteDownload = createDeleteDownloadMutation();

  const handleRetry = () => {
    retryDownload.mutate(props.downloadId);
  };

  const handleDelete = () => {
    deleteDownload.mutate({ downloadId: props.downloadId });
  };

  const handleReconcile = () => {
    reconcileDownload.mutate(props.downloadId);
  };

  const canReconcile = () =>
    props.allowedActions?.includes("reconcile") ??
    (props.status?.toLowerCase() === "completed" && !props.reconciledAt);
  const canRetry = () =>
    props.allowedActions?.includes("retry") ??
    (props.status?.toLowerCase() === "failed" || props.status?.toLowerCase() === "error");
  const canDelete = () => props.allowedActions?.includes("delete") ?? true;

  return (
    <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <DownloadEventsDialog
        description="Timeline of queue, status, retry, and import events for this historical download."
        downloadId={props.downloadId}
        formatTimestamp={(value) => new Date(value).toLocaleString()}
        title={`Download Events - ${props.animeTitle}`}
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
