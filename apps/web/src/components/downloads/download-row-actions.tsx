import {
  IconCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-solidjs";
import { Show } from "solid-js";
import { toast } from "solid-sonner";
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

    toast.promise(pauseDownload.mutateAsync(props.downloadId), {
      loading: "Pausing download...",
      success: "Download paused",
      error: (err) => `Failed to pause download: ${err.message}`,
    });
  };

  const handleResume = () => {
    if (!props.downloadId) {
      return;
    }

    toast.promise(resumeDownload.mutateAsync(props.downloadId), {
      loading: "Resuming download...",
      success: "Download resumed",
      error: (err) => `Failed to resume download: ${err.message}`,
    });
  };

  const handleRetry = () => {
    if (!props.downloadId) {
      return;
    }

    toast.promise(retryDownload.mutateAsync(props.downloadId), {
      loading: "Retrying download...",
      success: "Download retried",
      error: (err) => `Failed to retry download: ${err.message}`,
    });
  };

  return (
    <div class="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <Show
        when={
          props.statusPresentation.label.toLowerCase().includes("paused") ||
          props.statusPresentation.label.toLowerCase().includes("queued") ||
          props.statusPresentation.tone === "destructive"
        }
        fallback={
          <Button
            variant="ghost"
            size="icon"
            class="relative after:absolute after:-inset-2 h-7 w-7"
            aria-label="Pause download"
            onClick={handlePause}
            disabled={!props.downloadId || pauseDownload.isPending}
          >
            <IconPlayerPause class="h-4 w-4" />
          </Button>
        }
      >
        <Button
          variant="ghost"
          size="icon"
          class="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Resume download"
          onClick={handleResume}
          disabled={!props.downloadId || resumeDownload.isPending}
        >
          <IconPlayerPlay class="h-4 w-4" />
        </Button>
      </Show>
      <DownloadEventsDialog
        description="Timeline of queue, status, and import events for this download."
        {...(props.downloadId === undefined ? {} : { downloadId: props.downloadId })}
        formatTimestamp={(value) => new Date(value).toLocaleString()}
        title={`Download Events${props.animeTitle ? ` - ${props.animeTitle}` : ""}`}
        triggerLabel="View download events"
      />
      <Show when={props.statusPresentation.tone === "destructive"}>
        <Button
          variant="ghost"
          size="icon"
          class="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Retry download"
          onClick={handleRetry}
          disabled={!props.downloadId || retryDownload.isPending}
        >
          <IconRefresh class="h-4 w-4" />
        </Button>
      </Show>
    </div>
  );
}

interface HistoryDownloadActionsProps {
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
    toast.promise(retryDownload.mutateAsync(props.downloadId), {
      loading: "Retrying download...",
      success: "Download retried",
      error: (err) => `Failed to retry download: ${err.message}`,
    });
  };

  const handleDelete = () => {
    toast.promise(deleteDownload.mutateAsync({ downloadId: props.downloadId }), {
      loading: "Removing download...",
      success: "Download removed",
      error: (err) => `Failed to remove download: ${err.message}`,
    });
  };

  const handleReconcile = () => {
    toast.promise(reconcileDownload.mutateAsync(props.downloadId), {
      loading: "Reconciling download...",
      success: "Download reconciled",
      error: (err) => `Failed to reconcile download: ${err.message}`,
    });
  };

  return (
    <div class="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <DownloadEventsDialog
        description="Timeline of queue, status, retry, and import events for this historical download."
        downloadId={props.downloadId}
        formatTimestamp={(value) => new Date(value).toLocaleString()}
        title={`Download Events - ${props.animeTitle}`}
        triggerLabel="View download events"
      />
      <Show when={props.status?.toLowerCase() === "completed" && !props.reconciledAt}>
        <Button
          variant="ghost"
          size="icon"
          class="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Mark as reconciled"
          onClick={handleReconcile}
          disabled={reconcileDownload.isPending}
        >
          <IconCheck class="h-4 w-4" />
        </Button>
      </Show>
      <Show
        when={props.status?.toLowerCase() === "failed" || props.status?.toLowerCase() === "error"}
      >
        <Button
          variant="ghost"
          size="icon"
          class="relative after:absolute after:-inset-2 h-7 w-7"
          aria-label="Retry download"
          onClick={handleRetry}
          disabled={retryDownload.isPending}
        >
          <IconRefresh class="h-4 w-4" />
        </Button>
      </Show>
      <Button
        variant="ghost"
        size="icon"
        class="relative after:absolute after:-inset-2 h-7 w-7"
        aria-label="Remove download"
        onClick={handleDelete}
        disabled={deleteDownload.isPending}
      >
        <IconTrash class="h-4 w-4" />
      </Button>
    </div>
  );
}
