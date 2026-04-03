import type { PreferredTitle } from "@packages/shared/index.ts";

import type { SelectedAnimeTitleForNaming } from "@/features/operations/naming-types.ts";

export function selectAnimeTitleForNaming(
  animeRow: {
    titleRomaji: string;
    titleEnglish?: string | null;
    titleNative?: string | null;
  },
  preferredTitle: PreferredTitle,
): string {
  return selectAnimeTitleForNamingDetails(animeRow, preferredTitle).title;
}

export function selectAnimeTitleForNamingDetails(
  animeRow: {
    titleRomaji: string;
    titleEnglish?: string | null;
    titleNative?: string | null;
  },
  preferredTitle: PreferredTitle,
): SelectedAnimeTitleForNaming {
  const orderedTitles = resolveOrderedAnimeTitles(animeRow, preferredTitle);

  for (const entry of orderedTitles) {
    const value = normalizeText(entry.value);

    if (value !== undefined) {
      return {
        source: entry.source,
        title: value,
      };
    }
  }

  return {
    source: preferredTitle === "romaji" ? "preferred_romaji" : "fallback_romaji",
    title: animeRow.titleRomaji,
  };
}

function resolveOrderedAnimeTitles(
  animeRow: {
    titleRomaji: string;
    titleEnglish?: string | null;
    titleNative?: string | null;
  },
  preferredTitle: PreferredTitle,
) {
  if (preferredTitle === "english") {
    return [
      { source: "preferred_english" as const, value: animeRow.titleEnglish },
      { source: "fallback_romaji" as const, value: animeRow.titleRomaji },
      { source: "fallback_native" as const, value: animeRow.titleNative },
    ];
  }

  if (preferredTitle === "native") {
    return [
      { source: "preferred_native" as const, value: animeRow.titleNative },
      { source: "fallback_romaji" as const, value: animeRow.titleRomaji },
      { source: "fallback_english" as const, value: animeRow.titleEnglish },
    ];
  }

  return [
    { source: "preferred_romaji" as const, value: animeRow.titleRomaji },
    { source: "fallback_english" as const, value: animeRow.titleEnglish },
    { source: "fallback_native" as const, value: animeRow.titleNative },
  ];
}

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
