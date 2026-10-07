import { useReducer, useRef } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ImportFileSelection,
  ImportPlanResult,
  MediaId,
  MediaKind,
  MediaSearchResult,
  ScannedFile,
} from "@/api/contracts";
import { errorMessage } from "@/api/effect/errors";
import { mediaListQueryOptions } from "@/api/media";
import { useAddMediaMutation } from "@/api/media-mutations";
import { profilesQueryOptions } from "@/api/profiles";
import { systemConfigQueryOptions } from "@/api/system-config";
import {
  useImportFilesMutation,
  usePlanImportMutation,
  usePreviewImportPathMutation,
  usePreviewImportSelectionMutation,
  useSelectAllImportFilesMutation,
  useSetImportFileMappingMutation,
  useSetImportFileMediaMutation,
  useToggleImportFileMutation,
} from "@/api/system-library";
import type { Step } from "./types";

interface ImportFlowOptions {
  mediaId?: number;
  onImportSuccess?: () => void;
  onImportQueued?: (taskId: number | undefined) => void;
}

export function toImportInputMode(value: string | null | undefined): "browser" | "manual" {
  return value === "manual" ? "manual" : "browser";
}

interface BulkProgress {
  total: number;
  succeeded: MediaId[];
  failed: MediaId[];
}

interface State {
  path: string;
  step: Step;
  selectedFiles: Map<string, ImportFileSelection>;
  inputMode: "browser" | "manual";
  selectedCandidateIds: Set<MediaId>;
  manualCandidates: MediaSearchResult[];
  isSearchOpen: boolean;
  missingCandidates: MediaSearchResult[];
  addDialogCandidate: MediaSearchResult | null;
  bulkProgress: BulkProgress | null;
  pendingCandidateId: MediaId | null;
  lastPlan: ImportPlanResult | null;
}

type Action =
  | { type: "reset" }
  | { type: "setPath"; path: string }
  | { type: "setStep"; step: Step }
  | { type: "setInputMode"; mode: "browser" | "manual" }
  | { type: "setIsSearchOpen"; value: boolean }
  | {
      type: "selectionSuccess";
      candidateIds: Set<MediaId>;
      files: Map<string, ImportFileSelection>;
    }
  | { type: "setPendingCandidate"; candidateId: MediaId | null }
  | { type: "manualAdd"; candidate: MediaSearchResult }
  | { type: "planMissing"; candidates: MediaSearchResult[] }
  | { type: "clearMissing" }
  | { type: "openAddDialog"; candidate: MediaSearchResult }
  | { type: "closeAddDialog" }
  | { type: "removeMissing"; candidateId: MediaId }
  | { type: "bulkAddStart"; total: number }
  | { type: "bulkAddSettled"; candidateId: MediaId; ok: boolean }
  | { type: "bulkAddPartial"; failedIds: readonly MediaId[] }
  | { type: "planSuccess"; plan: ImportPlanResult }
  | { type: "clearPlan" };

const initialState: State = {
  path: "",
  step: "scan",
  selectedFiles: new Map(),
  inputMode: "browser",
  selectedCandidateIds: new Set(),
  manualCandidates: [],
  isSearchOpen: false,
  missingCandidates: [],
  addDialogCandidate: null,
  bulkProgress: null,
  pendingCandidateId: null,
  lastPlan: null,
};

const EMPTY_CANDIDATES: readonly MediaSearchResult[] = [];

function toSelectionMap(files: readonly ImportFileSelection[]) {
  return new Map(files.map((file) => [file.source_path, file] as const));
}

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
    case "setIsSearchOpen":
      return { ...state, isSearchOpen: action.value };
    case "selectionSuccess":
      return {
        ...state,
        selectedFiles: action.files,
        selectedCandidateIds: action.candidateIds,
        pendingCandidateId: null,
        lastPlan: null,
      };
    case "setPendingCandidate":
      return { ...state, pendingCandidateId: action.candidateId };
    case "manualAdd":
      return {
        ...state,
        manualCandidates: [...state.manualCandidates, action.candidate],
        isSearchOpen: false,
      };
    case "planMissing":
      return { ...state, missingCandidates: action.candidates, bulkProgress: null };
    case "clearMissing":
      return { ...state, missingCandidates: [], addDialogCandidate: null, bulkProgress: null };
    case "openAddDialog":
      return { ...state, addDialogCandidate: action.candidate };
    case "closeAddDialog":
      return { ...state, addDialogCandidate: null };
    case "removeMissing": {
      const remaining = state.missingCandidates.filter(
        (candidate) => candidate.id !== action.candidateId,
      );
      return {
        ...state,
        missingCandidates: remaining,
        ...(remaining.length === 0 ? { bulkProgress: null } : {}),
      };
    }
    case "bulkAddStart":
      return {
        ...state,
        bulkProgress: { total: action.total, succeeded: [], failed: [] },
      };
    case "bulkAddSettled": {
      if (!state.bulkProgress) {
        return state;
      }
      const next: BulkProgress = {
        total: state.bulkProgress.total,
        succeeded:
          action.ok && !state.bulkProgress.succeeded.includes(action.candidateId)
            ? [...state.bulkProgress.succeeded, action.candidateId]
            : state.bulkProgress.succeeded,
        failed:
          !action.ok && !state.bulkProgress.failed.includes(action.candidateId)
            ? [...state.bulkProgress.failed, action.candidateId]
            : state.bulkProgress.failed,
      };
      return { ...state, bulkProgress: next };
    }
    case "bulkAddPartial":
      return {
        ...state,
        bulkProgress: null,
        missingCandidates: state.missingCandidates.filter((candidate) =>
          action.failedIds.includes(candidate.id),
        ),
      };
    case "planSuccess":
      return { ...state, lastPlan: action.plan };
    case "clearPlan":
      return { ...state, lastPlan: null };
    default:
      return state;
  }
}

function rootFolderForMediaKind(
  library: { anime_path: string; manga_path: string; light_novel_path: string },
  mediaKind: MediaKind | null | undefined,
) {
  if (mediaKind === "manga") {
    return library.manga_path;
  }

  if (mediaKind === "light_novel") {
    return library.light_novel_path;
  }

  return library.anime_path;
}

export function useImportFlow(options: ImportFlowOptions = {}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const scanMutation = usePreviewImportPathMutation();
  const importMutation = useImportFilesMutation();
  const importSelectionMutation = usePreviewImportSelectionMutation();
  const toggleFileMutation = useToggleImportFileMutation();
  const setFileMediaMutation = useSetImportFileMediaMutation();
  const setFileMappingMutation = useSetImportFileMappingMutation();
  const selectAllMutation = useSelectAllImportFilesMutation();
  const planMutation = usePlanImportMutation();
  const addMediaMutation = useAddMediaMutation();
  const { data: animeList } = useSuspenseQuery(mediaListQueryOptions());
  const { data: profiles } = useSuspenseQuery(profilesQueryOptions());
  const { data: config } = useSuspenseQuery(systemConfigQueryOptions());
  // Tracks one bulk-add run: per-candidate outcomes until the last parallel
  // mutation settles, then the flow advances. Scoped to the run, not the
  // module, so overlapping runs cannot corrupt each other.
  const bulkRunRef = useRef<{ total: number; settled: Map<MediaId, boolean> } | null>(null);

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
  const candidates = [
    ...scanCandidates,
    ...state.manualCandidates.filter(
      (manualCandidate) => !scanCandidates.some((candidate) => candidate.id === manualCandidate.id),
    ),
  ];
  const libraryIds = new Set(animeList.map((media) => media.id));

  const isSelectionPending =
    importSelectionMutation.isPending ||
    toggleFileMutation.isPending ||
    setFileMediaMutation.isPending ||
    setFileMappingMutation.isPending ||
    selectAllMutation.isPending;

  // Selection mutations are serialized by disabling their triggers while one
  // is in flight. The server owns the selection math; the client only stores
  // the latest server answer.
  const guardSelectionPending = () => {
    if (isSelectionPending) {
      toast.info("Wait for the current update to finish, then try again.");
      return true;
    }
    return false;
  };

  const selectionPayload = () => ({
    files: scanMutation.data?.files ?? [],
    selected_candidate_ids: [...state.selectedCandidateIds],
    selected_files: [...state.selectedFiles.values()],
  });

  const applySelectionResult = (next: {
    selected_candidate_ids: readonly MediaId[];
    selected_files: readonly ImportFileSelection[];
  }) => {
    dispatch({
      type: "selectionSuccess",
      candidateIds: new Set(next.selected_candidate_ids),
      files: toSelectionMap(next.selected_files),
    });
  };

  const toggleCandidate = (candidate: MediaSearchResult, forceSelect = false) => {
    if (guardSelectionPending()) {
      return;
    }
    dispatch({ type: "setPendingCandidate", candidateId: candidate.id });
    importSelectionMutation.mutate(
      {
        ...selectionPayload(),
        candidate_id: candidate.id,
        candidate_title:
          candidate.title.english || candidate.title.romaji || candidate.title.native || "",
        ...(forceSelect ? { force_select: true } : {}),
      },
      {
        onSuccess: (next) => applySelectionResult(next),
        onError: (error) => {
          dispatch({ type: "setPendingCandidate", candidateId: null });
          toast.error(errorMessage(error, "Could not update the series selection"));
        },
      },
    );
  };

  const toggleFile = (file: ScannedFile, targetAnimeId?: MediaId) => {
    if (guardSelectionPending()) {
      return;
    }
    toggleFileMutation.mutate(
      {
        ...selectionPayload(),
        source_path: file.source_path,
        ...(targetAnimeId === undefined ? {} : { media_id: targetAnimeId }),
      },
      {
        onSuccess: (next) => {
          applySelectionResult(next);
          const stillUnselected = !next.selected_files.some(
            (entry) => entry.source_path === file.source_path,
          );
          if (stillUnselected) {
            toast.info("Choose a series for this file before selecting it.");
          }
        },
        onError: (error) => {
          toast.error(errorMessage(error, "Could not update the file selection"));
        },
      },
    );
  };

  const updateFileAnime = (file: ScannedFile, newAnimeId: MediaId) => {
    if (guardSelectionPending()) {
      return;
    }
    setFileMediaMutation.mutate(
      {
        ...selectionPayload(),
        source_path: file.source_path,
        media_id: newAnimeId,
      },
      {
        onSuccess: (next) => {
          applySelectionResult(next);
          const stillUnselected = !next.selected_files.some(
            (entry) => entry.source_path === file.source_path,
          );
          if (stillUnselected) {
            toast.info("Set the episode number first, then pick a series.");
          }
        },
        onError: (error) => {
          toast.error(errorMessage(error, "Could not change the series for this file"));
        },
      },
    );
  };

  const updateFileMapping = (file: ScannedFile, season: number, episode: number) => {
    if (guardSelectionPending()) {
      return;
    }
    setFileMappingMutation.mutate(
      {
        ...selectionPayload(),
        source_path: file.source_path,
        ...(season === undefined ? {} : { season }),
        unit_number: episode,
      },
      {
        onSuccess: (next) => {
          applySelectionResult(next);
          const stillUnselected = !next.selected_files.some(
            (entry) => entry.source_path === file.source_path,
          );
          if (stillUnselected) {
            toast.info("Pick a series for this file to keep the new mapping.");
          }
        },
        onError: (error) => {
          toast.error(errorMessage(error, "Could not update the episode mapping"));
        },
      },
    );
  };

  const selectAll = () => {
    if (guardSelectionPending()) {
      return;
    }
    selectAllMutation.mutate(
      { files: scanMutation.data?.files ?? [] },
      {
        onSuccess: (next) => {
          applySelectionResult(next);
          toast.info(
            next.selected_files.length > 0
              ? `Selected ${next.selected_files.length} file(s) with a matched series.`
              : "No files have a matched series yet. Add a series or assign files manually.",
          );
        },
        onError: (error) => {
          toast.error(errorMessage(error, "Could not select all files"));
        },
      },
    );
  };

  const clearSelection = () => {
    dispatch({ type: "selectionSuccess", candidateIds: new Set(), files: new Map() });
  };

  const handleReset = () => {
    bulkRunRef.current = null;
    dispatch({ type: "reset" });
  };

  const handleScan = () => {
    const mediaId = options.mediaId;
    scanMutation.mutate(
      {
        path: state.path,
        ...(mediaId === undefined ? {} : { media_id: mediaId }),
      },
      {
        onSuccess: (data) => {
          bulkRunRef.current = null;
          dispatch({ type: "clearMissing" });
          dispatch({
            type: "selectionSuccess",
            candidateIds: new Set(data.initial_selection.selected_candidate_ids),
            files: toSelectionMap(data.initial_selection.selected_files),
          });
          dispatch({ type: "setStep", step: "review" });
        },
        onError: (error) => {
          toast.error(errorMessage(error, "Scan failed. Check the folder path and try again."));
        },
      },
    );
  };

  const startImport = (files: readonly ImportFileSelection[]) => {
    importMutation.mutate([...files], {
      onSuccess: (accepted) => {
        toast.info(accepted.message);
        options.onImportQueued?.(accepted.task_id);
        options.onImportSuccess?.();
      },
      onError: (error) => {
        toast.error(errorMessage(error, "Could not start the import"));
      },
    });
  };

  const handleImport = () => {
    const files = Array.from(state.selectedFiles.values());
    if (files.length === 0) {
      toast.info("Select at least one file to import.");
      return;
    }
    planMutation.mutate(
      { selected_files: files },
      {
        onSuccess: (plan) => {
          if (plan.unimportable.length > 0) {
            dispatch({ type: "planSuccess", plan });
            toast.error(
              `${plan.unimportable.length} selected file(s) need attention before importing.`,
            );
            return;
          }
          const byId = new Map(candidates.map((candidate) => [candidate.id, candidate] as const));
          const missing = plan.missing_media_ids.flatMap((id) => {
            const candidate = byId.get(id);
            return candidate ? [candidate] : [];
          });
          if (missing.length > 0) {
            dispatch({ type: "planMissing", candidates: missing });
            return;
          }
          if (plan.missing_media_ids.length > 0) {
            toast.error("Some selected series are missing details. Rescan and try again.");
            return;
          }
          dispatch({ type: "clearPlan" });
          startImport(files);
        },
        onError: (error) => {
          toast.error(errorMessage(error, "Could not check the import plan"));
        },
      },
    );
  };

  const handleSingleAdded = (candidateId: MediaId) => {
    const remaining = state.missingCandidates.filter((candidate) => candidate.id !== candidateId);
    dispatch({ type: "removeMissing", candidateId });
    if (remaining.length === 0) {
      dispatch({ type: "clearMissing" });
      handleImport();
    }
  };

  const handleAddAllMissing = () => {
    if (state.missingCandidates.length === 0 || state.bulkProgress) {
      return;
    }
    const defaultProfile = profiles[0]?.name;
    if (!defaultProfile) {
      toast.error("No quality profile exists yet. Add one in Settings first.");
      return;
    }
    const snapshot = [...state.missingCandidates];
    dispatch({ type: "bulkAddStart", total: snapshot.length });
    bulkRunRef.current = { total: snapshot.length, settled: new Map() };
    for (const candidate of snapshot) {
      addMediaMutation.mutate(
        {
          id: candidate.id,
          ...(candidate.id_space == null ? {} : { id_space: candidate.id_space }),
          ...(candidate.media_kind == null ? {} : { media_kind: candidate.media_kind }),
          profile_name: defaultProfile,
          root_folder: rootFolderForMediaKind(config.library, candidate.media_kind),
          monitor_and_search: true,
          monitored: true,
          release_profile_ids: [],
        },
        {
          onSuccess: () => handleBulkSettled(snapshot, candidate.id, true),
          onError: (error) => {
            toast.error(
              errorMessage(error, `Could not add ${candidate.title.romaji ?? candidate.id}`),
            );
            handleBulkSettled(snapshot, candidate.id, false);
          },
        },
      );
    }
  };

  const handleBulkSettled = (
    snapshot: readonly MediaSearchResult[],
    candidateId: MediaId,
    ok: boolean,
  ) => {
    const run = bulkRunRef.current;
    if (!run) {
      return;
    }
    run.settled.set(candidateId, ok);
    dispatch({ type: "bulkAddSettled", candidateId, ok });
    if (run.settled.size < run.total) {
      return;
    }
    bulkRunRef.current = null;
    const failedIds = snapshot
      .filter((candidate) => run.settled.get(candidate.id) !== true)
      .map((candidate) => candidate.id);
    if (failedIds.length === 0) {
      toast.success(`Added ${snapshot.length} series to the library. Starting import.`);
      dispatch({ type: "clearMissing" });
      handleImport();
      return;
    }
    toast.error(
      `${failedIds.length} of ${snapshot.length} series could not be added. Fix them individually below.`,
    );
    dispatch({ type: "bulkAddPartial", failedIds });
  };

  const isTogglingCandidate = (candidateId: number) =>
    state.pendingCandidateId === candidateId && isSelectionPending;

  return {
    addDialogCandidate: state.addDialogCandidate,
    openAddDialog: (candidate: MediaSearchResult) => dispatch({ type: "openAddDialog", candidate }),
    closeAddCandidateDialog: () => dispatch({ type: "closeAddDialog" }),
    handleSingleAdded,
    handleAddAllMissing,
    dismissMissing: () => dispatch({ type: "clearMissing" }),
    missingCandidates: state.missingCandidates,
    bulkProgress: state.bulkProgress,
    isBulkAdding: state.bulkProgress !== null,
    animeList,
    candidates,
    clearSelection,
    handleImport,
    handleManualAdd: (candidate: MediaSearchResult) => {
      dispatch({ type: "manualAdd", candidate });
      toggleCandidate(candidate, true);
    },
    handleScan,
    importMutation,
    importSelectionMutation,
    inputMode: state.inputMode,
    isAwaitingToggle: isSelectionPending,
    isTogglingCandidate,
    lastPlan: state.lastPlan,
    clearPlan: () => dispatch({ type: "clearPlan" }),
    libraryIds,
    manualCandidates: state.manualCandidates,
    path: state.path,
    planMutation,
    reset: handleReset,
    scanMutation,
    scannedFiles,
    selectAll,
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
    isSearchOpen: state.isSearchOpen,
  };
}

export type ImportFlow = ReturnType<typeof useImportFlow>;
