import { useEffect, useMemo, useState } from "react";
import { createSystemConfigQuery } from "~/lib/api";
import { toImportInputMode, useImportFlow } from "~/components/import/use-import-flow";
import type { FileRowAnimeOption, Step } from "~/components/import/types";

export type BrowseRootKey = "library" | "recycle" | "downloads";

export interface AllowedRoot {
  key: BrowseRootKey;
  label: string;
  path: string;
}

export const importSteps: { id: Step; label: string; description: string }[] = [
  { id: "scan", label: "Select Path", description: "Choose a folder to scan" },
  { id: "review", label: "Review Files", description: "Confirm files to import" },
];

function titleLabel(title: { romaji?: string | undefined; english?: string | undefined }) {
  return title.english || title.romaji || "Unknown title";
}

interface CreateImportPageStateOptions {
  animeId: number | undefined;
  onImportSuccess: () => void;
}

export function createImportPageState(options: CreateImportPageStateOptions) {
  const [latestImportTaskId, setLatestImportTaskId] = useState<number | undefined>(undefined);

  const flow = useImportFlow({
    ...(options.animeId === undefined ? {} : { animeId: options.animeId }),
    onImportQueued: (taskId) => {
      setLatestImportTaskId(taskId);
    },
    onImportSuccess: options.onImportSuccess,
  });

  const configQuery = createSystemConfigQuery();
  const [selectedBrowseRoot, setSelectedBrowseRoot] = useState<BrowseRootKey>("library");
  const [pathAutofillEnabled, setPathAutofillEnabled] = useState(true);

  const currentStepIndex = useMemo(
    () => importSteps.findIndex((stepConfig) => stepConfig.id === flow.step),
    [flow.step],
  );

  const allowedRoots = useMemo<AllowedRoot[]>(() => {
    const config = configQuery.data;
    if (!config) {
      return [];
    }

    return [
      {
        key: "library" as const,
        label: "Library",
        path: config.library.library_path.trim(),
      },
      {
        key: "recycle" as const,
        label: "Recycle",
        path: config.library.recycle_path.trim(),
      },
      {
        key: "downloads" as const,
        label: "Downloads",
        path: config.downloads.root_path.trim(),
      },
    ].filter((root) => root.path.length > 0);
  }, [configQuery.data]);

  const animeOptions = useMemo<FileRowAnimeOption[]>(() => {
    const animeList = flow.animeListQuery.data ?? [];
    const candidateList = flow.candidates;
    const animeIds = new Set(animeList.map((anime) => anime.id));

    return [
      ...animeList.map((anime) => ({
        id: anime.id,
        source: "library" as const,
        title: {
          romaji: titleLabel(anime.title),
          ...(anime.title.english ? { english: anime.title.english } : {}),
        },
      })),
      ...candidateList
        .filter((candidate) => !animeIds.has(candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          source: "candidate" as const,
          title: {
            romaji: titleLabel(candidate.title),
            ...(candidate.title.english ? { english: candidate.title.english } : {}),
          },
        })),
    ].toSorted((left, right) => titleLabel(left.title).localeCompare(titleLabel(right.title)));
  }, [flow.animeListQuery.data, flow.candidates]);

  const candidateIds = useMemo(
    () => new Set(flow.candidates.map((candidate) => candidate.id)),
    [flow.candidates],
  );
  const manualCandidateIds = useMemo(
    () => new Set(flow.manualCandidates.map((candidate) => candidate.id)),
    [flow.manualCandidates],
  );

  const activeBrowseRoot = useMemo(
    () => allowedRoots.find((root) => root.key === selectedBrowseRoot) ?? allowedRoots[0] ?? null,
    [allowedRoots, selectedBrowseRoot],
  );
  const flowPath = flow.path;
  const setFlowPath = flow.setPath;

  useEffect(() => {
    const root = activeBrowseRoot;
    if (!root) {
      return;
    }

    if (!flowPath && pathAutofillEnabled) {
      setFlowPath(root.path);
    }
  }, [activeBrowseRoot, flowPath, pathAutofillEnabled, setFlowPath]);

  useEffect(() => {
    const roots = allowedRoots;
    const fallbackRoot = roots[0];
    if (!fallbackRoot) {
      return;
    }

    if (!roots.some((root) => root.key === selectedBrowseRoot)) {
      setSelectedBrowseRoot(fallbackRoot.key);
    }
  }, [allowedRoots, selectedBrowseRoot]);

  const setInputMode = (value: string | null | undefined) => {
    flow.setInputMode(toImportInputMode(value));
  };

  const selectBrowseRoot = (value: string | null) => {
    const root = allowedRoots.find((item) => item.key === value);
    if (!root) {
      return;
    }

    setSelectedBrowseRoot(root.key);
    setPathAutofillEnabled(true);
    flow.setPath(root.path);
  };

  const clearPath = () => {
    setPathAutofillEnabled(false);
    flow.setPath("");
  };

  const setPathFromBrowserSelection = (value: string) => {
    setPathAutofillEnabled(false);
    flow.setPath(value);
  };

  const setPathFromManualInput = (value: string) => {
    setPathAutofillEnabled(false);
    flow.setPath(value);
  };

  return {
    activeBrowseRoot,
    allowedRoots,
    animeOptions,
    candidateIds,
    clearPath,
    configQuery,
    currentStepIndex,
    flow,
    latestImportTaskId,
    manualCandidateIds,
    selectBrowseRoot,
    setPathFromBrowserSelection,
    setPathFromManualInput,
    setInputMode,
  };
}

export type ImportPageState = ReturnType<typeof createImportPageState>;
