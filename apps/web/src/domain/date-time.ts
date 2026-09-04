import { differenceInDays, format, isAfter, isValid, parseISO } from "date-fns";

export function isAired(airedDate?: string | null, now = new Date()): boolean {
  if (!airedDate) return false;
  const aired = parseISO(airedDate);
  return isValid(aired) && !isAfter(aired, now);
}

export function formatUiTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}Z`;
  const date = parseISO(candidate);

  if (!isValid(date)) {
    return value;
  }

  return format(date, "yyyy-MM-dd HH:mm:ss");
}

export function formatDate(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "MMM d, yyyy") : value;
}

export function formatDateTime(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "MMM d, yyyy h:mm a") : value;
}

export function formatTime(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "h:mm a") : value;
}

function parseFlexibleDate(value: string): Date {
  const iso = parseISO(value);
  if (isValid(iso)) return iso;
  const fallback = new Date(value);
  return fallback;
}

export function formatSearchResultAge(dateStr: string): string {
  const date = parseFlexibleDate(dateStr);
  if (!isValid(date)) return dateStr;
  const now = new Date();
  const diffDays = differenceInDays(now, date);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return format(date, "MMM d, yy");
}
