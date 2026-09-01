import {
  RiCheckLine,
  RiDeleteBinLine,
  RiPauseLine,
  RiPlayLine,
  RiRefreshLine,
} from "@remixicon/react";
import { DownloadEventsDialog } from "@/features/downloads/download-events-dialog";
import { IconButton } from "@/components/shared/icon-button";
import {
  useDeleteDownloadMutation,
  usePauseDownloadMutation,
  useReconcileDownloadMutation,
  useResumeDownloadMutation,
  useRetryDownloadMutation,
} from "@/api/system-downloads";
import { formatDateTime } from "@/domain/date-time";

interface ActiveDownloadActionsProps {
  allowedActions?: readonly string[] | undefined;
  downloadId?: number | undefined;
  mediaTitle?: string | undefined;
}

export function ActiveDownloadActions(props: ActiveDownloadActionsProps) {
  const pauseDownload = usePauseDownloadMutation();
  const resumeDownload = useResumeDownloadMutation();
  const retryDownload = useRetryDownloadMutation();
  const deleteDownload = useDeleteDownloadMutation();
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

  const handleDelete = () => {
    if (!props.downloadId) {
      return;
    }

    deleteDownload.mutate({ downloadId: props.downloadId });
  };

  const canDelete = () => allowedActions.includes("delete");
  const canPause = () => allowedActions.includes("pause");
  const canResume = () => allowedActions.includes("resume");
  const canRetry = () => allowedActions.includes("retry");

  return (
    <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      {canResume() ? (
        <IconButton
          size="icon-sm"
          aria-label="Resume download"
          onPress={handleResume}
          isDisabled={!props.downloadId || resumeDownload.isPending}
        >
          <RiPlayLine className="h-4 w-4" />
        </IconButton>
      ) : (
        canPause() && (
          <IconButton
            size="icon-sm"
            aria-label="Pause download"
            onPress={handlePause}
            isDisabled={!props.downloadId || pauseDownload.isPending}
          >
            <RiPauseLine className="h-4 w-4" />
          </IconButton>
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
        <IconButton
          size="icon-sm"
          aria-label="Retry download"
          onPress={handleRetry}
          isDisabled={!props.downloadId || retryDownload.isPending}
        >
          <RiRefreshLine className="h-4 w-4" />
        </IconButton>
      )}
      {canDelete() && (
        <IconButton
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          aria-label="Remove download"
          onPress={handleDelete}
          isDisabled={!props.downloadId || deleteDownload.isPending}
        >
          <RiDeleteBinLine className="h-4 w-4" />
        </IconButton>
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
        <IconButton
          size="icon-sm"
          aria-label="Mark as reconciled"
          onPress={handleReconcile}
          isDisabled={reconcileDownload.isPending}
        >
          <RiCheckLine className="h-4 w-4" />
        </IconButton>
      )}
      {canRetry() && (
        <IconButton
          size="icon-sm"
          aria-label="Retry download"
          onPress={handleRetry}
          isDisabled={retryDownload.isPending}
        >
          <RiRefreshLine className="h-4 w-4" />
        </IconButton>
      )}
      {canDelete() && (
        <IconButton
          size="icon-sm"
          aria-label="Remove download"
          onPress={handleDelete}
          isDisabled={deleteDownload.isPending}
        >
          <RiDeleteBinLine className="h-4 w-4" />
        </IconButton>
      )}
    </div>
  );
}
