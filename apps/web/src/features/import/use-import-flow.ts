import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { MediaId, MediaSearchResult, ImportFileRequest, ScannedFile } from "@/api/contracts";
import { mediaListQueryOptions } from "@/api/media";
import {
  useImportFilesMutation,
  usePreviewImportPathMutation,
  usePreviewImportSelectionMutation,
} from "@/api/system-library";
import { buildImportFileRequest, findMissingImportCandidates } from "./import-flow";
import { createImportDropzoneHandlers } from "./import-dropzone";
import {
  toggleSelectedImportFile,
  updateSelectedImportFileAnime,
  updateSelectedImportFileMapping,
} from "./import-file-selection";
import type { Step } from "./types";

interface ImportFlowOptions {
  mediaId?: number;
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
  selectedCandidateIds: Set<MediaId>;
  manualCandidates: MediaSearchResult[];
  isSearchOpen: boolean;
  pendingAddCandidates: MediaSearchResult[];
  currentAddIndex: number;
}

type Action =
  | { type: "reset" }
  | { type: "setPath"; path: string }
  | { type: "setStep"; step: Step }
  | { type: "setInputMode"; mode: "browser" | "manual" }
  | { type: "setIsDragOver"; value: boolean }
  | { type: "setIsSearchOpen"; value: boolean }
  | { type: "scanSuccess"; preselected: Map<string, ImportFileRequest>; candidateIds: Set<MediaId> }
  | {
      type: "toggleCandidateSuccess";
      candidateIds: Set<MediaId>;
      files: Map<string, ImportFileRequest>;
    }
  | { type: "manualAdd"; candidate: MediaSearchResult }
  | { type: "startAddCandidates"; candidates: MediaSearchResult[] }
  | { type: "advanceAddCandidate" }
  | { type: "closeAddCandidateDialog" }
  | { type: "toggleFile"; file: ScannedFile; targetAnimeId: MediaId }
  | { type: "updateFileAnime"; file: ScannedFile; newAnimeId: MediaId }
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

const EMPTY_CANDIDATES: readonly MediaSearchResult[] = [];

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
  // Latest selection snapshot for async callbacks: rapid candidate toggles must
  // read the current state at execution time, not the render-time closure.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  // Serializes candidate toggles: each request builds on the previous
  // response's selection, so concurrent toggles cannot overwrite each other.
  const toggleChainRef = useRef<Promise<void> | null>(null);
  const toggleChain = () => {
    toggleChainRef.current ??= Promise.resolve();
    return toggleChainRef.current;
  };

  const scanMutation = usePreviewImportPathMutation();
  const importMutation = useImportFilesMutation();
  const importSelectionMutation = usePreviewImportSelectionMutation();
  const { data: animeList } = useSuspenseQuery(mediaListQueryOptions());

  const scannedFiles = [...(scanMutation.data?.files ?? [])].toSorted((a, b) => {
    const seasonA = a.season ?? 0;
    const seasonB = b.season ?? 0;
    if (seasonA !== seasonB) {
      return seasonA - seasonB;
    }
    return a.unit_number - b.unit_number;
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
  const libraryIds = useMemo(() => new Set(animeList.map((media) => media.id)), [animeList]);
  const activeAddCandidate = state.pendingAddCandidates[state.currentAddIndex];

  const reset = useCallback(() => {
    dispatch({ type: "reset" });
  }, []);

  const toggleCandidate = useCallback(
    (candidate: MediaSearchResult, forceSelect = false) => {
      const run = toggleChain().then(() => {
        const latest = stateRef.current;
        return new Promise<void>((resolve) => {
          importSelectionMutation.mutate(
            {
              candidate_id: candidate.id,
              candidate_title:
                candidate.title.english || candidate.title.romaji || candidate.title.native || "",
              force_select: forceSelect,
              files: scanMutation.data?.files ?? [],
              selected_candidate_ids: [...latest.selectedCandidateIds],
              selected_files: [...latest.selectedFiles.values()],
            },
            {
              onSuccess: (next) => {
                dispatch({
                  type: "toggleCandidateSuccess",
                  candidateIds: new Set(next.selected_candidate_ids),
                  files: new Map(next.selected_files.map((file) => [file.source_path, file])),
                });
                resolve();
              },
              onError: () => {
                resolve();
              },
            },
          );
        });
      });
      toggleChainRef.current = run;
      setPendingToggles((count) => count + 1);
      void run.finally(() => setPendingToggles((count) => count - 1));
    },
    [importSelectionMutation, scanMutation.data],
  );

  const handleManualAdd = useCallback(
    (candidate: MediaSearchResult) => {
      dispatch({ type: "manualAdd", candidate });
      toggleCandidate(candidate, true);
    },
    [toggleCandidate],
  );

  const handleScan = useCallback(() => {
    const mediaId = options.mediaId;
    scanMutation.mutate(
      {
        path: state.path,
        ...(mediaId === undefined ? {} : { media_id: mediaId }),
      },
      {
        onSuccess: (data) => {
          const preselected = new Map<string, ImportFileRequest>();
          const newSelectedCandidates = new Set<MediaId>();

          data.files.forEach((file) => {
            if (file.matched_media) {
              preselected.set(
                file.source_path,
                buildImportFileRequest({
                  mediaId: file.matched_media.id,
                  file,
                }),
              );
              return;
            }

            if (file.suggested_candidate_id) {
              preselected.set(
                file.source_path,
                buildImportFileRequest({
                  mediaId: file.suggested_candidate_id,
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
  }, [options.mediaId, scanMutation, state.path]);

  const closeAddCandidateDialog = useCallback(() => {
    dispatch({ type: "closeAddCandidateDialog" });
  }, []);

  const handleImportWithLibraryIds = useCallback(
    (localAnimeIds: ReadonlySet<MediaId>) => {
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

  const toggleFile = useCallback((file: ScannedFile, targetAnimeId: MediaId) => {
    dispatch({ type: "toggleFile", file, targetAnimeId });
  }, []);

  const updateFileAnime = useCallback((file: ScannedFile, newAnimeId: MediaId) => {
    dispatch({ type: "updateFileAnime", file, newAnimeId });
  }, []);

  const updateFileMapping = useCallback((file: ScannedFile, season: number, episode: number) => {
    dispatch({ type: "updateFileMapping", file, season, episode });
  }, []);

  const setInputMode = useCallback((mode: "browser" | "manual") => {
    dispatch({ type: "setInputMode", mode });
  }, []);

  const setIsSearchOpen = useCallback((value: boolean) => {
    dispatch({ type: "setIsSearchOpen", value });
  }, []);

  const setPath = useCallback((path: string) => {
    dispatch({ type: "setPath", path });
  }, []);

  const setStep = useCallback((step: Step) => {
    dispatch({ type: "setStep", step });
  }, []);

  const dropzoneHandlers = createImportDropzoneHandlers({
    setInputMode,
    setIsDragOver: (value) => dispatch({ type: "setIsDragOver", value }),
    setPath,
  });

  const isTogglingCandidate = useCallback(
    (candidateId: number) =>
      importSelectionMutation.isPending &&
      importSelectionMutation.variables?.candidate_id === candidateId,
    [importSelectionMutation.isPending, importSelectionMutation.variables],
  );

  // Import submits the current selection; block while any serialized toggle is
  // queued or in flight so it cannot send a selection that is about to change.
  // Chain depth is the source of truth — `isPending` misses queued toggles.
  const [pendingToggles, setPendingToggles] = useState(0);
  const isAwaitingToggle = pendingToggles > 0;

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
    isAwaitingToggle,
    isTogglingCandidate,
    libraryIds,
    manualCandidates: state.manualCandidates,
    path: state.path,
    pendingAddCandidates: state.pendingAddCandidates,
    reset,
    scanMutation,
    scannedFiles,
    selectedCandidateIds: state.selectedCandidateIds,
    selectedFiles: state.selectedFiles,
    setInputMode,
    setIsSearchOpen,
    setPath,
    setStep,
    skippedFiles,
    step: state.step,
    toggleCandidate,
    toggleFile,
    updateFileAnime,
    updateFileMapping,
  };
}
