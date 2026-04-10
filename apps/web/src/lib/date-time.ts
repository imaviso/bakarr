import { format } from "date-fns";

export function formatUiTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}Z`;
  const date = new Date(candidate);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return format(date, "yyyy-MM-dd HH:mm:ss");
}
