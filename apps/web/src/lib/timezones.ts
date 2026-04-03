export interface TimeZoneOption {
  label: string;
  note?: string;
  value: string;
}

const FALLBACK_TIME_ZONES = [
  "UTC",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
];

export function getTimeZoneOptions(currentValue?: string) {
  const values = ["system", ...loadSupportedTimeZones()];
  const trimmedCurrent = currentValue?.trim();

  if (trimmedCurrent && trimmedCurrent.length > 0 && !values.includes(trimmedCurrent)) {
    values.push(trimmedCurrent);
  }

  return values.map(
    (value) =>
      ({
        label: formatTimeZoneLabel(value),
        note: formatTimeZoneNote(value),
        value,
      }) satisfies TimeZoneOption,
  );
}

export function formatTimeZoneLabel(value?: string) {
  const normalized = normalizeTimeZoneValue(value);

  if (normalized === "system") {
    return "System timezone";
  }

  return normalized.replace(/_/g, " ");
}

function formatTimeZoneNote(value: string) {
  if (value !== "system") {
    return undefined;
  }

  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved ? `Currently ${resolved}` : undefined;
}

function normalizeTimeZoneValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "system";
}

function loadSupportedTimeZones() {
  if ("supportedValuesOf" in Intl && typeof Intl.supportedValuesOf === "function") {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [...FALLBACK_TIME_ZONES];
    }
  }

  return [...FALLBACK_TIME_ZONES];
}
