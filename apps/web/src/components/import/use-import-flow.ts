import type { Accessor } from "solid-js";
import { createMemo, createSignal } from "solid-js";
import {
  type AnimeSearchResult,
  createAnimeListQuery,
  createImportFilesMutation,
  createScanImportPathMutation,
  type ImportFileRequest,
  type ScannedFile,
} from "~/lib/api";
import {
  buildImportFileRequest,
  findMissingImportCandidates,
  toggleImportCandidateSelection,
} from "./import-flow";
import { createImportDropzoneHandlers } from "./import-dropzone";
import {
  toggleSelectedImportFile,
  updateSelectedImportFileAnime,
  updateSelectedImportFileMapping,
} from "./import-file-selection";
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

  const handleImport = () => {
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

    importMutation.mutate(files, {
      onSuccess: () => {
        options.onImportSuccess?.();
      },
    });
  };

  const advanceAddCandidateDialog = () => {
    if (currentAddIndex() + 1 >= pendingAddCandidates().length) {
      closeAddCandidateDialog();
      if (options.autoImportAfterMissingCandidatesResolved ?? true) {
        queueMicrotask(() => {
          handleImport();
        });
      }
      return;
    }

    setCurrentAddIndex((index) => index + 1);
  };

  const toggleFile = (file: ScannedFile, targetAnimeId: number) => {
    const next = toggleSelectedImportFile(selectedFiles(), file, targetAnimeId);
    setSelectedFiles(next);
  };

  const updateFileAnime = (file: ScannedFile, newAnimeId: number) => {
    const next = updateSelectedImportFileAnime(selectedFiles(), file, newAnimeId);
    setSelectedFiles(next);
  };

  const updateFileMapping = (file: ScannedFile, season: number, episode: number) => {
    const next = updateSelectedImportFileMapping(selectedFiles(), file, season, episode);
    setSelectedFiles(next);
  };
  const dropzoneHandlers = createImportDropzoneHandlers({
    setInputMode,
    setIsDragOver,
    setPath,
  });

  return {
    activeAddCandidate,
    advanceAddCandidateDialog,
    animeListQuery,
    candidates,
    closeAddCandidateDialog,
    currentAddIndex,
    handleDragLeave: dropzoneHandlers.handleDragLeave,
    handleDragOver: dropzoneHandlers.handleDragOver,
    handleDrop: dropzoneHandlers.handleDrop,
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
