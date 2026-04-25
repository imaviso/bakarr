export type DateRangePresetHours = 24 | 168 | 720;

const PRESET_TOLERANCE_MINUTES = 2;

export function formatDateTimeLocalInput(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  const hour = `${value.getHours()}`.padStart(2, "0");
  const minute = `${value.getMinutes()}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function getDateRangePresetHours(
  startValue: string,
  endValue: string,
): DateRangePresetHours | undefined {
  if (!startValue || !endValue) {
    return undefined;
  }

  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return undefined;
  }

  const diffMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (diffMinutes <= 0) {
    return undefined;
  }

  if (Math.abs(diffMinutes - 24 * 60) <= PRESET_TOLERANCE_MINUTES) {
    return 24;
  }
  if (Math.abs(diffMinutes - 24 * 7 * 60) <= PRESET_TOLERANCE_MINUTES) {
    return 168;
  }
  if (Math.abs(diffMinutes - 24 * 30 * 60) <= PRESET_TOLERANCE_MINUTES) {
    return 720;
  }

  return undefined;
}
