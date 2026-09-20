export { ConfigSchema } from "@bakarr/shared";

import { IMPORT_MODE_VALUES, PREFERRED_TITLE_VALUES } from "@bakarr/shared";
import { formatUiTimestamp } from "@/domain/date-time";

export const IMPORT_MODE_OPTIONS = IMPORT_MODE_VALUES;
export const PREFERRED_TITLE_OPTIONS = PREFERRED_TITLE_VALUES;

export function importModeLabel(value: string) {
  return value === "copy" ? "Copy" : "Move";
}

export function preferredTitleLabel(value: string) {
  switch (value) {
    case "english":
      return "English";
    case "native":
      return "Native";
    default:
      return "Romaji";
  }
}

export function formatLastRun(dateStr?: string | null) {
  if (!dateStr) return "Never";
  return formatUiTimestamp(dateStr);
}

export type ConfigSettingsMode = "general" | "automation";
