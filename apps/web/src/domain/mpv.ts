export function buildMpvUrl(origin: string, path: string): string {
  return `mpv://${origin}${path}`;
}
