export { ConfigSchema } from "@bakarr/shared";

export const IMPORT_MODE_OPTIONS = ["copy", "move"] as const;
export const PREFERRED_TITLE_OPTIONS = ["romaji", "english", "native"] as const;

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
  try {
    const date = new Date(`${dateStr.replace(" ", "T")}Z`);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

export type ConfigSettingsMode = "general" | "automation";
