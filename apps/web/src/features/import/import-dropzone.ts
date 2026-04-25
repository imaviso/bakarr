interface ImportDropzoneHandlersOptions {
  setInputMode: (value: "browser" | "manual") => void;
  setIsDragOver: (value: boolean) => void;
  setPath: (value: string) => void;
}

function getDroppedFilePath(file: File): string | undefined {
  if (!Object.hasOwn(file, "path")) {
    return undefined;
  }

  const value = Reflect.get(file, "path");
  return typeof value === "string" ? value : undefined;
}

export function createImportDropzoneHandlers(options: ImportDropzoneHandlersOptions) {
  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    options.setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    options.setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    options.setIsDragOver(false);

    const items = event.dataTransfer?.items;
    if (items && items.length > 0) {
      const item = items[0];
      if (item?.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          const droppedPath = getDroppedFilePath(file);
          if (droppedPath) {
            options.setPath(droppedPath);
            options.setInputMode("manual");
          }
        }
      }
    }

    const textData = event.dataTransfer?.getData("text/plain");
    if (textData && (textData.startsWith("/") || textData.startsWith("file://"))) {
      options.setPath(textData.replace("file://", ""));
      options.setInputMode("manual");
    }
  };

  return {
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}
import type { DragEvent } from "react";
