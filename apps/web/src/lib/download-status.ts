export interface DownloadStatusPresentation {
  icon:
    | "alert"
    | "arrow-down"
    | "check"
    | "clock"
    | "pause";
  label: string;
  tone: "destructive" | "info" | "muted" | "success" | "warning";
}

export function getDownloadStatusPresentation(
  status?: string,
): DownloadStatusPresentation {
  const normalized = status?.toLowerCase();

  switch (normalized) {
    case "completed":
      return { icon: "check", label: "Completed", tone: "success" };
    case "downloading":
      return { icon: "arrow-down", label: "Downloading", tone: "info" };
    case "failed":
      return { icon: "alert", label: "Failed", tone: "destructive" };
    case "error":
      return { icon: "alert", label: "Error", tone: "destructive" };
    case "paused":
      return { icon: "pause", label: "Paused", tone: "warning" };
    case "queued":
      return { icon: "clock", label: "Queued", tone: "muted" };
    default: {
      // Capitalize the first letter for display consistency
      const displayLabel = status
        ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
        : "Unknown";
      return {
        icon: "clock" as const,
        label: displayLabel,
        tone: "muted" as const,
      };
    }
  }
}
