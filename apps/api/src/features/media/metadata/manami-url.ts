import { Option } from "effect";

export function parseAniListIdFromSource(source: string): number | undefined {
  return parseResourceIdFromSource(source, ["anilist.co", "www.anilist.co"], "media");
}

export function parseMalIdFromSource(source: string): number | undefined {
  const pathId = parseResourceIdFromSource(
    source,
    ["myanimelist.net", "www.myanimelist.net"],
    "media",
  );

  if (pathId !== undefined) {
    return pathId;
  }

  return parseQueryIdFromSource(source, ["myanimelist.net", "www.myanimelist.net"], "id");
}

function parseResourceIdFromSource(
  source: string,
  hosts: ReadonlyArray<string>,
  resourceSegment: string,
): number | undefined {
  const url = tryParseUrl(source);

  if (url === undefined || !hosts.includes(url.hostname.toLowerCase())) {
    return undefined;
  }

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const resourceIndex = segments.indexOf(resourceSegment);

  if (resourceIndex === -1 || resourceIndex + 1 >= segments.length) {
    return undefined;
  }

  return parsePositiveInteger(segments[resourceIndex + 1]);
}

function parseQueryIdFromSource(
  source: string,
  hosts: ReadonlyArray<string>,
  queryKey: string,
): number | undefined {
  const url = tryParseUrl(source);

  if (url === undefined || !hosts.includes(url.hostname.toLowerCase())) {
    return undefined;
  }

  return parsePositiveInteger(url.searchParams.get(queryKey) ?? undefined);
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function tryParseUrl(value: string): URL | undefined {
  return Option.getOrElse(Option.liftThrowable(() => new URL(value))(), () => undefined);
}
