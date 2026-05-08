import { describe, expect, it, vi } from "vitest";
import { createImportDropzoneHandlers } from "./import-dropzone";

interface TestDragEvent {
  dataTransfer?: {
    getData: (type: string) => string;
    items?: Array<{ kind: string; getAsFile: () => File | null }>;
  };
  preventDefault: () => void;
  preventDefaultMock: ReturnType<typeof vi.fn>;
  stopPropagation: () => void;
  stopPropagationMock: ReturnType<typeof vi.fn>;
}

function createDragEvent(dataTransfer?: {
  getData?: (type: string) => string;
  items?: Array<{ kind: string; getAsFile: () => File | null }>;
}): TestDragEvent {
  const preventDefaultMock = vi.fn();
  const stopPropagationMock = vi.fn();
  const dataTransferValue = dataTransfer
    ? {
        getData: dataTransfer.getData ?? (() => ""),
        ...(dataTransfer.items === undefined ? {} : { items: dataTransfer.items }),
      }
    : undefined;

  return {
    ...(dataTransferValue === undefined ? {} : { dataTransfer: dataTransferValue }),
    preventDefault: preventDefaultMock,
    preventDefaultMock,
    stopPropagation: stopPropagationMock,
    stopPropagationMock,
  };
}

function fileWithPath(path: string): File {
  const file = new File([], "episode.mkv");
  Object.defineProperty(file, "path", { value: path });
  return file;
}

describe("import dropzone handlers", () => {
  it("marks drag state while preventing browser navigation", () => {
    const setIsDragOver = vi.fn();
    const handlers = createImportDropzoneHandlers({
      setInputMode: vi.fn(),
      setIsDragOver,
      setPath: vi.fn(),
    });
    const event = createDragEvent();

    handlers.handleDragOver(event);

    expect(event.preventDefaultMock).toHaveBeenCalledOnce();
    expect(event.stopPropagationMock).toHaveBeenCalledOnce();
    expect(setIsDragOver).toHaveBeenCalledWith(true);
  });

  it("uses dropped file path when browser exposes one", () => {
    const setInputMode = vi.fn();
    const setPath = vi.fn();
    const handlers = createImportDropzoneHandlers({
      setInputMode,
      setIsDragOver: vi.fn(),
      setPath,
    });
    const file = fileWithPath("/downloads/show");

    handlers.handleDrop(
      createDragEvent({
        items: [{ kind: "file", getAsFile: () => file }],
      }),
    );

    expect(setPath).toHaveBeenCalledWith("/downloads/show");
    expect(setInputMode).toHaveBeenCalledWith("manual");
  });

  it("uses plain text paths when files do not expose paths", () => {
    const setInputMode = vi.fn();
    const setPath = vi.fn();
    const handlers = createImportDropzoneHandlers({
      setInputMode,
      setIsDragOver: vi.fn(),
      setPath,
    });

    handlers.handleDrop(
      createDragEvent({
        getData: (type) => (type === "text/plain" ? "file:///mnt/imports/show" : ""),
        items: [{ kind: "file", getAsFile: () => new File([], "episode.mkv") }],
      }),
    );

    expect(setPath).toHaveBeenCalledWith("/mnt/imports/show");
    expect(setInputMode).toHaveBeenCalledWith("manual");
  });

  it("ignores non-path text drops", () => {
    const setInputMode = vi.fn();
    const setPath = vi.fn();
    const handlers = createImportDropzoneHandlers({
      setInputMode,
      setIsDragOver: vi.fn(),
      setPath,
    });

    handlers.handleDrop(createDragEvent({ getData: () => "show name" }));

    expect(setPath).not.toHaveBeenCalled();
    expect(setInputMode).not.toHaveBeenCalled();
  });
});
