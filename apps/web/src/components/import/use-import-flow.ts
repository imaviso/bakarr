import type { Accessor } from "solid-js";
import { createMemo, createSignal } from "solid-js";
import { toast } from "solid-sonner";
import {
  type AnimeSearchResult,
  createAnimeListQuery,
  createImportFilesMutation,
  createScanImportPathMutation,
  type ImportFileRequest,
  type ScannedFile,
} from "~/lib/api";
import { summarizeImportNamingOutcome } from "~/lib/scanned-file";
import {
  buildImportFileRequest,
  findMissingImportCandidates,
  toggleImportCandidateSelection,
} from "./import-flow";
import type { Step } from "./types";

interface ImportFlowOptions {
  animeId?: Accessor<number | undefined>;
  autoImportAfterMissingCandidatesResolved?: boolean;
  beforeImport?: () => void;
  onImportSuccess?: () => void;
}

export function toImportInputMode(value: string | null | undefined): "browser" | "manual" {
  return value === "manual" ? "manual" : "browser";
}

function getDroppedFilePath(file: File): string | undefined {
  if (!Object.hasOwn(file, "path")) {
    return undefined;
  }

  const value = Reflect.get(file, "path");
  return typeof value === "string" ? value : undefined;
}

export function useImportFlow(options: ImportFlowOptions = {}) {
  const [path, setPath] = createSignal("");
  const [step, setStep] = createSignal<Step>("scan");
  const [selectedFiles, setSelectedFiles] = createSignal<Map<string, ImportFileRequest>>(new Map());
  const [inputMode, setInputMode] = createSignal<"browser" | "manual">("browser");
  const [isDragOver, setIsDragOver] = createSignal(false);

  const [selectedCandidateIds, setSelectedCandidateIds] = createSignal<Set<number>>(new Set());
  const [manualCandidates, setManualCandidates] = createSignal<AnimeSearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = createSignal(false);
  const [pendingAddCandidates, setPendingAddCandidates] = createSignal<AnimeSearchResult[]>([]);
  const [currentAddIndex, setCurrentAddIndex] = createSignal(0);

  const scanMutation = createScanImportPathMutation();
  const importMutation = createImportFilesMutation();
  const animeListQuery = createAnimeListQuery();

  const scannedFiles = createMemo(() => {
    const files = scanMutation.data?.files ?? [];
    return [...files].toSorted((a, b) => {
      const seasonA = a.season ?? 0;
      const seasonB = b.season ?? 0;
      if (seasonA !== seasonB) {
        return seasonA - seasonB;
      }
      return a.episode_number - b.episode_number;
    });
  });

  const skippedFiles = createMemo(() => scanMutation.data?.skipped ?? []);
  const candidates = createMemo(() => [
    ...(scanMutation.data?.candidates ?? []),
    ...manualCandidates().filter(
      (manualCandidate) =>
        !(scanMutation.data?.candidates ?? []).some(
          (candidate) => candidate.id === manualCandidate.id,
        ),
    ),
  ]);
  const libraryIds = createMemo(
    () => new Set((animeListQuery.data ?? []).map((anime) => anime.id)),
  );
  const activeAddCandidate = createMemo(() => pendingAddCandidates()[currentAddIndex()]);

  const reset = () => {
    setStep("scan");
    setPath("");
    setSelectedFiles(new Map());
    setSelectedCandidateIds(new Set<number>());
    setManualCandidates([]);
    setIsSearchOpen(false);
    setPendingAddCandidates([]);
    setCurrentAddIndex(0);
    setInputMode("browser");
    setIsDragOver(false);
  };

  const handleManualAdd = (candidate: AnimeSearchResult) => {
    setManualCandidates((prev) => [...prev, candidate]);
    setIsSearchOpen(false);
    toggleCandidate(candidate, true);
  };

  const handleScan = () => {
    const animeId = options.animeId?.();
    scanMutation.mutate(
      {
        path: path(),
        ...(animeId === undefined ? {} : { anime_id: animeId }),
      },
      {
        onSuccess: (data) => {
          const preselected = new Map<string, ImportFileRequest>();
          const newSelectedCandidates = new Set<number>();

          data.files.forEach((file) => {
            if (file.matched_anime) {
              preselected.set(
                file.source_path,
                buildImportFileRequest({
                  animeId: file.matched_anime.id,
                  file,
                }),
              );
              return;
            }

            if (file.suggested_candidate_id) {
              preselected.set(
                file.source_path,
                buildImportFileRequest({
                  animeId: file.suggested_candidate_id,
                  file,
                }),
              );
              newSelectedCandidates.add(file.suggested_candidate_id);
            }
          });

          setSelectedFiles(preselected);
          setSelectedCandidateIds(newSelectedCandidates);
          setStep("review");
        },
      },
    );
  };

  const toggleCandidate = (candidate: AnimeSearchResult, forceSelect = false) => {
    const next = toggleImportCandidateSelection({
      candidate,
      files: scanMutation.data?.files ?? [],
      forceSelect,
      selectedCandidateIds: selectedCandidateIds(),
      selectedFiles: selectedFiles(),
    });

    setSelectedCandidateIds(next.selectedCandidateIds);
    setSelectedFiles(next.selectedFiles);
  };

  const closeAddCandidateDialog = () => {
    setPendingAddCandidates([]);
    setCurrentAddIndex(0);
  };

  const handleImport = async () => {
    const files = Array.from(selectedFiles().values());
    const missingCandidates = findMissingImportCandidates({
      files,
      localAnimeIds: new Set(animeListQuery.data?.map((anime) => anime.id) ?? []),
      candidates: candidates(),
    });

    if (missingCandidates.length > 0) {
      setPendingAddCandidates(missingCandidates);
      setCurrentAddIndex(0);
      return;
    }

    options.beforeImport?.();

    const toastId = toast.loading(`Importing ${files.length} file(s)...`);

    try {
      const result = await importMutation.mutateAsync(files);
      const namingDetail = summarizeImportNamingOutcome(result.imported_files);

      if (result.failed > 0) {
        toast.warning(
          namingDetail
            ? `Imported ${result.imported} file(s), ${result.failed} failed. ${namingDetail}.`
            : `Imported ${result.imported} file(s), ${result.failed} failed.`,
          { id: toastId },
        );
      } else {
        toast.success(
          namingDetail
            ? `Imported ${result.imported} file(s). ${namingDetail}.`
            : `Imported ${result.imported} file(s).`,
          { id: toastId },
        );
      }

      options.onImportSuccess?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Import failed: ${message}`, { id: toastId });
    }
  };

  const advanceAddCandidateDialog = () => {
    if (currentAddIndex() + 1 >= pendingAddCandidates().length) {
      closeAddCandidateDialog();
      if (options.autoImportAfterMissingCandidatesResolved ?? true) {
        queueMicrotask(() => {
          void handleImport();
        });
      }
      return;
    }

    setCurrentAddIndex((index) => index + 1);
  };

  const toggleFile = (file: ScannedFile, targetAnimeId: number) => {
    const next = new Map(selectedFiles());
    if (next.has(file.source_path)) {
      next.delete(file.source_path);
    } else {
      next.set(file.source_path, buildImportFileRequest({ animeId: targetAnimeId, file }));
    }
    setSelectedFiles(next);
  };

  const updateFileAnime = (file: ScannedFile, newAnimeId: number) => {
    const next = new Map(selectedFiles());
    if (!next.has(file.source_path)) {
      return;
    }

    const existing = next.get(file.source_path);
    if (!existing) {
      return;
    }

    next.set(
      file.source_path,
      buildImportFileRequest({
        animeId: newAnimeId,
        episodeNumber: existing.episode_number,
        ...(existing.episode_numbers === undefined
          ? {}
          : { episodeNumbers: existing.episode_numbers }),
        file,
        ...(existing.season === undefined ? {} : { season: existing.season }),
        ...(existing.source_metadata === undefined
          ? {}
          : { sourceMetadata: existing.source_metadata }),
      }),
    );

    setSelectedFiles(next);
  };

  const updateFileMapping = (file: ScannedFile, season: number, episode: number) => {
    const next = new Map(selectedFiles());
    const current =
      next.get(file.source_path) ??
      buildImportFileRequest({
        animeId: file.matched_anime?.id ?? 0,
        file,
      });

    next.set(
      file.source_path,
      buildImportFileRequest({
        animeId: current.anime_id,
        episodeNumber: episode,
        ...(current.episode_numbers === undefined
          ? {}
          : { episodeNumbers: current.episode_numbers }),
        file,
        season,
        ...(current.source_metadata === undefined
          ? {}
          : { sourceMetadata: current.source_metadata }),
      }),
    );
    setSelectedFiles(next);
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const items = event.dataTransfer?.items;
    if (items && items.length > 0) {
      const item = items[0];
      if (item?.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          const droppedPath = getDroppedFilePath(file);
          if (droppedPath) {
            setPath(droppedPath);
            setInputMode("manual");
          }
        }
      }
    }

    const textData = event.dataTransfer?.getData("text/plain");
    if (textData && (textData.startsWith("/") || textData.startsWith("file://"))) {
      setPath(textData.replace("file://", ""));
      setInputMode("manual");
    }
  };

  return {
    activeAddCandidate,
    advanceAddCandidateDialog,
    animeListQuery,
    candidates,
    closeAddCandidateDialog,
    currentAddIndex,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleImport,
    handleManualAdd,
    handleScan,
    importMutation,
    inputMode,
    isDragOver,
    isSearchOpen,
    libraryIds,
    manualCandidates,
    path,
    pendingAddCandidates,
    reset,
    scanMutation,
    scannedFiles,
    selectedCandidateIds,
    selectedFiles,
    setInputMode,
    setIsSearchOpen,
    setPath,
    setStep,
    skippedFiles,
    step,
    toggleCandidate,
    toggleFile,
    updateFileAnime,
    updateFileMapping,
  };
}
