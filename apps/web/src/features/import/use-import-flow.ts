import { useCallback, useMemo, useReducer } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AnimeId, AnimeSearchResult, ImportFileRequest, ScannedFile } from "~/api/contracts";
import { animeListQueryOptions } from "~/api/anime";
import {
  useImportCandidateSelectionMutation,
  useImportFilesMutation,
  useScanImportPathMutation,
} from "~/api/system-library";
import { buildImportFileRequest, findMissingImportCandidates } from "./import-flow";
import { createImportDropzoneHandlers } from "./import-dropzone";
import {
  toggleSelectedImportFile,
  updateSelectedImportFileAnime,
  updateSelectedImportFileMapping,
} from "./import-file-selection";
import type { Step } from "./types";

interface ImportFlowOptions {
  animeId?: number;
  autoImportAfterMissingCandidatesResolved?: boolean;
  beforeImport?: () => void;
  onImportSuccess?: () => void;
  onImportQueued?: (taskId: number | undefined) => void;
}

export function toImportInputMode(value: string | null | undefined): "browser" | "manual" {
  return value === "manual" ? "manual" : "browser";
}

interface State {
  path: string;
  step: Step;
  selectedFiles: Map<string, ImportFileRequest>;
  inputMode: "browser" | "manual";
  isDragOver: boolean;
  selectedCandidateIds: Set<AnimeId>;
  manualCandidates: AnimeSearchResult[];
  isSearchOpen: boolean;
  pendingAddCandidates: AnimeSearchResult[];
  currentAddIndex: number;
}

type Action =
  | { type: "reset" }
  | { type: "setPath"; path: string }
  | { type: "setStep"; step: Step }
  | { type: "setInputMode"; mode: "browser" | "manual" }
  | { type: "setIsDragOver"; value: boolean }
  | { type: "setIsSearchOpen"; value: boolean }
  | { type: "scanSuccess"; preselected: Map<string, ImportFileRequest>; candidateIds: Set<AnimeId> }
  | {
      type: "toggleCandidateSuccess";
      candidateIds: Set<AnimeId>;
      files: Map<string, ImportFileRequest>;
    }
  | { type: "manualAdd"; candidate: AnimeSearchResult }
  | { type: "startAddCandidates"; candidates: AnimeSearchResult[] }
  | { type: "advanceAddCandidate" }
  | { type: "closeAddCandidateDialog" }
  | { type: "toggleFile"; file: ScannedFile; targetAnimeId: AnimeId }
  | { type: "updateFileAnime"; file: ScannedFile; newAnimeId: AnimeId }
  | { type: "updateFileMapping"; file: ScannedFile; season: number; episode: number };

const initialState: State = {
  path: "",
  step: "scan",
  selectedFiles: new Map(),
  inputMode: "browser",
  isDragOver: false,
  selectedCandidateIds: new Set(),
  manualCandidates: [],
  isSearchOpen: false,
  pendingAddCandidates: [],
  currentAddIndex: 0,
};

const EMPTY_CANDIDATES: readonly AnimeSearchResult[] = [];

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return initialState;
    case "setPath":
      return { ...state, path: action.path };
    case "setStep":
      return { ...state, step: action.step };
    case "setInputMode":
      return { ...state, inputMode: action.mode };
    case "setIsDragOver":
      return { ...state, isDragOver: action.value };
    case "setIsSearchOpen":
      return { ...state, isSearchOpen: action.value };
    case "scanSuccess":
      return {
        ...state,
        selectedFiles: action.preselected,
        selectedCandidateIds: action.candidateIds,
        step: "review",
      };
    case "toggleCandidateSuccess":
      return {
        ...state,
        selectedCandidateIds: action.candidateIds,
        selectedFiles: action.files,
      };
    case "manualAdd":
      return {
        ...state,
        manualCandidates: [...state.manualCandidates, action.candidate],
        isSearchOpen: false,
      };
    case "startAddCandidates":
      return {
        ...state,
        pendingAddCandidates: action.candidates,
        currentAddIndex: 0,
      };
    case "advanceAddCandidate": {
      const nextIndex = state.currentAddIndex + 1;
      if (nextIndex >= state.pendingAddCandidates.length) {
        return { ...state, pendingAddCandidates: [], currentAddIndex: 0 };
      }
      return { ...state, currentAddIndex: nextIndex };
    }
    case "closeAddCandidateDialog":
      return { ...state, pendingAddCandidates: [], currentAddIndex: 0 };
    case "toggleFile": {
      const next = toggleSelectedImportFile(state.selectedFiles, action.file, action.targetAnimeId);
      return { ...state, selectedFiles: next };
    }
    case "updateFileAnime": {
      const next = updateSelectedImportFileAnime(
        state.selectedFiles,
        action.file,
        action.newAnimeId,
      );
      return { ...state, selectedFiles: next };
    }
    case "updateFileMapping": {
      const next = updateSelectedImportFileMapping(
        state.selectedFiles,
        action.file,
        action.season,
        action.episode,
      );
      return { ...state, selectedFiles: next };
    }
    default:
      return state;
  }
}

export function useImportFlow(options: ImportFlowOptions = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const scanMutation = useScanImportPathMutation();
  const importMutation = useImportFilesMutation();
  const importSelectionMutation = useImportCandidateSelectionMutation();
  const { data: animeList } = useSuspenseQuery(animeListQueryOptions());

  const scannedFiles = [...(scanMutation.data?.files ?? [])].toSorted((a, b) => {
    const seasonA = a.season ?? 0;
    const seasonB = b.season ?? 0;
    if (seasonA !== seasonB) {
      return seasonA - seasonB;
    }
    return a.episode_number - b.episode_number;
  });

  const skippedFiles = scanMutation.data?.skipped ?? [];
  const scanCandidates = scanMutation.data?.candidates ?? EMPTY_CANDIDATES;
  const candidates = useMemo(
    () => [
      ...scanCandidates,
      ...state.manualCandidates.filter(
        (manualCandidate) =>
          !scanCandidates.some((candidate) => candidate.id === manualCandidate.id),
      ),
    ],
    [scanCandidates, state.manualCandidates],
  );
  const libraryIds = useMemo(() => new Set(animeList.map((anime) => anime.id)), [animeList]);
  const activeAddCandidate = state.pendingAddCandidates[state.currentAddIndex];

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const toggleCandidate = useCallback(
    (candidate: AnimeSearchResult, forceSelect = false) => {
      importSelectionMutation.mutate(
        {
          candidate_id: candidate.id,
          candidate_title:
            candidate.title.english || candidate.title.romaji || candidate.title.native || "",
          force_select: forceSelect,
          files: scanMutation.data?.files ?? [],
          selected_candidate_ids: [...state.selectedCandidateIds],
          selected_files: [...state.selectedFiles.values()],
        },
        {
          onSuccess: (next) => {
            dispatch({
              type: "toggleCandidateSuccess",
              candidateIds: new Set(next.selected_candidate_ids),
              files: new Map(next.selected_files.map((file) => [file.source_path, file])),
            });
          },
        },
      );
    },
    [importSelectionMutation, scanMutation.data, state.selectedCandidateIds, state.selectedFiles],
  );

  const handleManualAdd = useCallback(
    (candidate: AnimeSearchResult) => {
      dispatch({ type: "manualAdd", candidate });
      toggleCandidate(candidate, true);
    },
    [toggleCandidate],
  );

  const handleScan = useCallback(() => {
    const animeId = options.animeId;
    scanMutation.mutate(
      {
        path: state.path,
        ...(animeId === undefined ? {} : { anime_id: animeId }),
      },
      {
        onSuccess: (data) => {
          const preselected = new Map<string, ImportFileRequest>();
          const newSelectedCandidates = new Set<AnimeId>();

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

          dispatch({ type: "scanSuccess", preselected, candidateIds: newSelectedCandidates });
        },
      },
    );
  }, [options.animeId, scanMutation, state.path]);

  const closeAddCandidateDialog = useCallback(() => {
    dispatch({ type: "closeAddCandidateDialog" });
  }, []);

  const handleImportWithLibraryIds = useCallback(
    (localAnimeIds: ReadonlySet<AnimeId>) => {
      const files = Array.from(state.selectedFiles.values());
      const missingCandidates = findMissingImportCandidates({
        files,
        localAnimeIds,
        candidates: candidates,
      });

      if (missingCandidates.length > 0) {
        dispatch({ type: "startAddCandidates", candidates: missingCandidates });
        return;
      }

      options.beforeImport?.();

      importMutation.mutate(files, {
        onSuccess: (accepted) => {
          toast.info(accepted.message);
          options.onImportQueued?.(accepted.task_id);
          options.onImportSuccess?.();
        },
      });
    },
    [state.selectedFiles, candidates, options, importMutation],
  );

  const handleImport = useCallback(() => {
    handleImportWithLibraryIds(libraryIds);
  }, [handleImportWithLibraryIds, libraryIds]);

  const advanceAddCandidateDialog = useCallback(() => {
    if (state.currentAddIndex + 1 >= state.pendingAddCandidates.length) {
      const nextLibraryIds = new Set(libraryIds);
      for (let index = 0; index <= state.currentAddIndex; index++) {
        const candidate = state.pendingAddCandidates[index];
        if (candidate) nextLibraryIds.add(candidate.id);
      }

      dispatch({ type: "closeAddCandidateDialog" });
      if (options.autoImportAfterMissingCandidatesResolved ?? true) {
        handleImportWithLibraryIds(nextLibraryIds);
      }
      return;
    }

    dispatch({ type: "advanceAddCandidate" });
  }, [
    state.currentAddIndex,
    state.pendingAddCandidates,
    libraryIds,
    options.autoImportAfterMissingCandidatesResolved,
    handleImportWithLibraryIds,
  ]);

  const toggleFile = useCallback((file: ScannedFile, targetAnimeId: AnimeId) => {
    dispatch({ type: "toggleFile", file, targetAnimeId });
  }, []);

  const updateFileAnime = useCallback((file: ScannedFile, newAnimeId: AnimeId) => {
    dispatch({ type: "updateFileAnime", file, newAnimeId });
  }, []);

  const updateFileMapping = useCallback((file: ScannedFile, season: number, episode: number) => {
    dispatch({ type: "updateFileMapping", file, season, episode });
  }, []);

  const dropzoneHandlers = createImportDropzoneHandlers({
    setInputMode: (mode) => dispatch({ type: "setInputMode", mode }),
    setIsDragOver: (value) => dispatch({ type: "setIsDragOver", value }),
    setPath: (path) => dispatch({ type: "setPath", path }),
  });

  return {
    activeAddCandidate,
    advanceAddCandidateDialog,
    animeList,
    candidates,
    closeAddCandidateDialog,
    currentAddIndex: state.currentAddIndex,
    handleDragLeave: dropzoneHandlers.handleDragLeave,
    handleDragOver: dropzoneHandlers.handleDragOver,
    handleDrop: dropzoneHandlers.handleDrop,
    handleImport,
    handleManualAdd,
    handleScan,
    importMutation,
    importSelectionMutation,
    inputMode: state.inputMode,
    isDragOver: state.isDragOver,
    isSearchOpen: state.isSearchOpen,
    libraryIds,
    manualCandidates: state.manualCandidates,
    path: state.path,
    pendingAddCandidates: state.pendingAddCandidates,
    reset,
    scanMutation,
    scannedFiles,
    selectedCandidateIds: state.selectedCandidateIds,
    selectedFiles: state.selectedFiles,
    setInputMode: (mode: "browser" | "manual") => dispatch({ type: "setInputMode", mode }),
    setIsSearchOpen: (value: boolean) => dispatch({ type: "setIsSearchOpen", value }),
    setPath: (path: string) => dispatch({ type: "setPath", path }),
    setStep: (step: Step) => dispatch({ type: "setStep", step }),
    skippedFiles,
    step: state.step,
    toggleCandidate,
    toggleFile,
    updateFileAnime,
    updateFileMapping,
  };
}
