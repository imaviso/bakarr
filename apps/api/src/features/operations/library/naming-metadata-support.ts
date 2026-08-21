import type { NamingInput } from "@/infra/naming.ts";
import {
  buildPathParseContext,
  parseFileSourceIdentity,
  toSharedParsedEpisodeIdentity,
} from "@/infra/media/identity/identity.ts";
import { extractYearFromDate } from "@/domain/media/date-utils.ts";
import {
  extractAudioChannels,
  extractAudioCodec,
  extractEpisodeTitleFromPath,
  extractQualitySourceLabel,
  extractVideoCodec,
  normalizeAirDate,
  normalizeText,
} from "@/infra/media/identity/scanned-file-metadata.ts";

export function buildEpisodeNamingInputFromPath(input: {
  animeStartDate?: string | null;
  mediaTitle: string;
  airDate?: string | null;
  unitNumbers: readonly number[];
  unitTitle?: string | null;
  filePath: string;
  rootFolder?: string;
  season?: number;
}): NamingInput {
  const context =
    input.rootFolder &&
    input.filePath.replace(/\/+$/, "").startsWith(input.rootFolder.replace(/\/+$/, "") + "/")
      ? buildPathParseContext(input.rootFolder, input.filePath)
      : undefined;
  const parsed = parseFileSourceIdentity(input.filePath, context);
  const sourceIdentity = parsed.source_identity;
  const sourceIdentityDto = toSharedParsedEpisodeIdentity(sourceIdentity);
  const { group } = parsed;

  return {
    airDate: normalizeAirDate(input.airDate),
    audioChannels: extractAudioChannels(input.filePath),
    audioCodec: extractAudioCodec(input.filePath),
    unitNumbers: [...input.unitNumbers],
    unitTitle:
      normalizeText(input.unitTitle) ??
      extractEpisodeTitleFromPath({
        filePath: input.filePath,
        group,
        sourceIdentity: sourceIdentityDto,
      }),
    group,
    quality: extractQualitySourceLabel(input.filePath),
    resolution: parsed.resolution,
    season: sourceIdentity?.scheme === "season" ? sourceIdentity.season : input.season,
    sourceIdentity: sourceIdentityDto,
    title: input.mediaTitle,
    videoCodec: extractVideoCodec(input.filePath),
    year: extractYearFromDate(input.animeStartDate),
  };
}

export function selectMediaYearForNaming(input: {
  startYear?: number | null;
  startDate?: string | null;
  endYear?: number | null;
  endDate?: string | null;
}) {
  return (
    input.startYear ??
    extractYearFromDate(input.startDate) ??
    input.endYear ??
    extractYearFromDate(input.endDate)
  );
}
