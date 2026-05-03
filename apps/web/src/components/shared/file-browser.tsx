import {
  ArrowUpIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  HouseIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import type { BrowseEntry } from "~/api/contracts";
import { errorMessage } from "~/api/effect/errors";
import { useBrowsePathQuery } from "~/api/system-library";
import { EmptyState } from "~/components/shared/empty-state";
import { cn } from "~/infra/utils";

const BROWSE_PAGE_SIZE = 100;

interface FileBrowserProps {
  /** Callback when a path is selected */
  onSelect: (path: string) => void;
  /** Whether to only allow selecting directories */
  directoryOnly?: boolean;
  /** Initial path to start browsing from */
  initialPath?: string;
  /** Height of the browser */
  height?: string;
}

export function FileBrowser(props: FileBrowserProps) {
  const directoryOnly = props.directoryOnly ?? true;
  const initialPath = props.initialPath ?? "";
  const height = props.height ?? "300px";

  const [currentPath, setCurrentPath] = useState(initialPath);
  const [manualPath, setManualPath] = useState(initialPath);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [pageOffset, setPageOffset] = useState(0);

  const browserQuery = useBrowsePathQuery(currentPath, {
    limit: BROWSE_PAGE_SIZE,
    offset: pageOffset,
  });

  const data = browserQuery.data;
  const pageInfo = data
    ? {
        start: data.offset + 1,
        end: data.offset + data.entries.length,
        total: data.total,
        hasMore: data.has_more,
      }
    : null;

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setManualPath(path);
    setSelectedPath(null);
    setPageOffset(0);
  };

  const handleSelect = (entry: BrowseEntry) => {
    if (entry.is_directory) {
      handleNavigate(entry.path);
    } else if (!directoryOnly) {
      setSelectedPath(entry.path);
      props.onSelect(entry.path);
    }
  };

  const handleDirectorySelect = (entry: BrowseEntry) => {
    if (entry.is_directory) {
      setSelectedPath(entry.path);
      props.onSelect(entry.path);
    }
  };

  const handleGoUp = () => {
    const parent = browserQuery.data?.parent_path;
    if (parent !== undefined) {
      handleNavigate(parent);
    }
  };

  const handleGoHome = () => {
    handleNavigate("");
  };

  const handleManualNavigate = () => {
    setCurrentPath(manualPath);
    setSelectedPath(null);
    setPageOffset(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleManualNavigate();
    }
  };

  const path = browserQuery.data?.current_path;
  const breadcrumbs = path && path !== "/" ? path.split("/").filter(Boolean) : [];

  const isFullHeight = height === "100%";

  return (
    <div
      className={cn(
        "border rounded-none overflow-hidden bg-background",
        isFullHeight && "h-full flex flex-col",
      )}
    >
      {/* Path input and navigation */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleGoHome}
          title="Go to root"
          aria-label="Go to root directory"
        >
          <HouseIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleGoUp}
          disabled={!browserQuery.data?.parent_path}
          title="Go up"
          aria-label="Go up one directory"
        >
          <ArrowUpIcon className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Input
            value={manualPath}
            onChange={(event) => setManualPath(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter path..."
            className="h-8 text-sm font-mono"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleManualNavigate}
          disabled={browserQuery.isFetching}
        >
          {browserQuery.isFetching ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : "Go"}
        </Button>
      </div>

      {/* Breadcrumb trail */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b text-xs text-muted-foreground overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={handleGoHome}
            className="hover:text-foreground transition-colors shrink-0"
          >
            /
          </button>
          {breadcrumbs.map((part, index) => {
            const partPath = `/${breadcrumbs.slice(0, index + 1).join("/")}`;
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={partPath} className="flex items-center gap-1 shrink-0">
                <CaretRightIcon className="h-3 w-3" />
                <button
                  type="button"
                  onClick={() => handleNavigate(partPath)}
                  className={cn(
                    "hover:text-foreground transition-colors truncate max-w-32",
                    isLast && "text-foreground font-medium",
                  )}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* File listing */}
      <div
        className={cn("overflow-auto", isFullHeight && "flex-1 min-h-0")}
        style={isFullHeight ? undefined : { height }}
      >
        {/* Show spinner when fetching new data while showing old data */}
        {browserQuery.isFetching && !browserQuery.isLoading && (
          <div className="absolute top-2 right-2 p-1 bg-background/80 rounded-none z-10">
            <SpinnerIcon className="h-3 w-3 animate-spin text-primary" />
          </div>
        )}

        {browserQuery.isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4, 5, 6].map((row) => (
              <div key={`skeleton-${row}`} className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : browserQuery.error ? (
          <div className="p-4 text-center text-sm text-destructive">
            {errorMessage(browserQuery.error, "Failed to load directory")}
          </div>
        ) : browserQuery.data?.entries.length === 0 ? (
          <EmptyState compact title="This directory is empty" />
        ) : (
          <div className="p-1">
            {browserQuery.data?.entries.map((entry) => (
              <FileEntry
                key={entry.path}
                entry={entry}
                isSelected={selectedPath === entry.path}
                onNavigate={() => handleSelect(entry)}
                onSelect={() => handleDirectorySelect(entry)}
                directoryOnly={directoryOnly}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {pageInfo && pageInfo.total > BROWSE_PAGE_SIZE && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t bg-muted text-xs text-muted-foreground shrink-0">
          <span>
            {pageInfo.start}–{pageInfo.end} of {pageInfo.total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={pageOffset === 0}
              aria-label="Previous page"
              onClick={() => setPageOffset((prev) => Math.max(0, prev - BROWSE_PAGE_SIZE))}
            >
              <CaretLeftIcon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!pageInfo.hasMore}
              aria-label="Next page"
              onClick={() => setPageOffset((prev) => prev + BROWSE_PAGE_SIZE)}
            >
              <CaretRightIcon className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Selected path indicator */}
      {selectedPath && (
        <div className="px-3 py-2 border-t bg-primary/10 text-xs">
          <span className="text-muted-foreground">Selected:</span>
          <span className="font-mono text-primary">{selectedPath}</span>
        </div>
      )}
    </div>
  );
}

interface FileEntryProps {
  entry: BrowseEntry;
  isSelected: boolean;
  onNavigate: () => void;
  onSelect: () => void;
  directoryOnly: boolean;
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function FileEntry(props: FileEntryProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-none cursor-pointer transition-colors group w-full text-left",
        props.isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted",
      )}
      onClick={props.onSelect}
      onDoubleClick={props.onNavigate}
      title={props.entry.is_directory ? "Double-click to open, click to select" : props.entry.path}
    >
      {props.entry.is_directory ? (
        props.isSelected ? (
          <FolderOpenIcon className="h-4 w-4 text-primary shrink-0" />
        ) : (
          <FolderIcon className="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0" />
        )
      ) : (
        <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className="text-sm truncate flex-1">{props.entry.name}</span>
      {!props.entry.is_directory && props.entry.size && (
        <span className="text-xs text-muted-foreground shrink-0">
          {formatSize(props.entry.size)}
        </span>
      )}
      {props.entry.is_directory && (
        <CaretRightIcon className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      )}
    </button>
  );
}
