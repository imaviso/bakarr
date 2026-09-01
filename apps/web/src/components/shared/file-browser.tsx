import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiArrowUpLine,
  RiFileLine,
  RiFolderLine,
  RiFolderOpenLine,
  RiHome5Line,
  RiLoader4Line,
} from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import type { BrowseEntry } from "@/api/contracts";
import { errorMessage } from "@/api/effect/errors";
import { browsePathQueryOptions } from "@/api/system-library";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/infra/utils";
import { formatBytes } from "@/domain/format";

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

  const browserQuery = useQuery(
    browsePathQueryOptions(currentPath, {
      limit: BROWSE_PAGE_SIZE,
      offset: pageOffset,
    }),
  );

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
          onPress={handleGoHome}
          aria-label="Go to root directory"
        >
          <RiHome5Line className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onPress={handleGoUp}
          isDisabled={!browserQuery.data?.parent_path}
          aria-label="Go up one directory"
        >
          <RiArrowUpLine className="h-4 w-4" />
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
          onPress={handleManualNavigate}
          isDisabled={browserQuery.isFetching}
        >
          {browserQuery.isFetching ? <RiLoader4Line className="h-4 w-4 animate-spin" /> : "Go"}
        </Button>
      </div>

      {/* Breadcrumb trail */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b text-xs text-muted-foreground overflow-x-auto shrink-0">
          <Button
            variant="link"
            onPress={handleGoHome}
            className="h-auto shrink-0 p-0 font-normal text-muted-foreground hover:text-foreground"
          >
            /
          </Button>
          {breadcrumbs.map((part, index) => {
            const partPath = `/${breadcrumbs.slice(0, index + 1).join("/")}`;
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={partPath} className="flex items-center gap-1 shrink-0">
                <RiArrowRightSLine className="h-3 w-3" />
                <Button
                  variant="link"
                  onPress={() => handleNavigate(partPath)}
                  className={cn(
                    "h-auto max-w-32 truncate p-0 font-normal text-muted-foreground hover:text-foreground",
                    isLast && "font-medium text-foreground",
                  )}
                >
                  {part}
                </Button>
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
            <RiLoader4Line className="h-3 w-3 animate-spin text-primary" />
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
              isDisabled={pageOffset === 0}
              aria-label="Previous page"
              onPress={() => setPageOffset((prev) => Math.max(0, prev - BROWSE_PAGE_SIZE))}
            >
              <RiArrowLeftSLine className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              isDisabled={!pageInfo.hasMore}
              aria-label="Next page"
              onPress={() => setPageOffset((prev) => prev + BROWSE_PAGE_SIZE)}
            >
              <RiArrowRightSLine className="h-3.5 w-3.5" />
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

function FileEntry(props: FileEntryProps) {
  return (
    <TooltipTrigger>
      <Button
        variant="ghost"
        onPress={props.onSelect}
        onDoubleClick={props.onNavigate}
        className={cn(
          "flex h-auto w-full items-center gap-2 rounded-none px-2 py-1.5 text-left font-normal",
          props.isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted",
        )}
      >
        {props.entry.is_directory ? (
          props.isSelected ? (
            <RiFolderOpenLine className="h-4 w-4 text-primary shrink-0" />
          ) : (
            <RiFolderLine className="h-4 w-4 text-muted-foreground group-hover/button:text-foreground shrink-0" />
          )
        ) : (
          <RiFileLine className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm truncate flex-1">{props.entry.name}</span>
        {!props.entry.is_directory && props.entry.size && (
          <span className="text-xs text-muted-foreground shrink-0">
            {props.entry.size !== undefined ? formatBytes(props.entry.size) : ""}
          </span>
        )}
        {props.entry.is_directory && (
          <RiArrowRightSLine className="h-3 w-3 text-muted-foreground opacity-0 group-hover/button:opacity-100 transition-opacity shrink-0" />
        )}
      </Button>
      <Tooltip>
        {props.entry.is_directory ? "Double-click to open, click to select" : props.entry.path}
      </Tooltip>
    </TooltipTrigger>
  );
}
