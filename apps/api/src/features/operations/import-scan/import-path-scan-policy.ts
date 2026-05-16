export const DEFAULT_IMPORT_SCAN_LIMIT = 300;
export const MAX_IMPORT_SCAN_LIMIT = 2000;

export function resolveImportScanLimit(limit?: number) {
  const requested = limit ?? DEFAULT_IMPORT_SCAN_LIMIT;
  return Math.min(Math.max(1, requested), MAX_IMPORT_SCAN_LIMIT);
}
