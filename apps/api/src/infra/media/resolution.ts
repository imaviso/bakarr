export function parseResolutionLabel(value: string): string | undefined {
  const lower = value.toLowerCase();

  if (lower.includes("2160") || lower.includes("4k")) return "2160p";
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("576")) return "576p";
  if (lower.includes("480")) return "480p";

  return undefined;
}
