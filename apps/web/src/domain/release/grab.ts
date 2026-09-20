import type {
  DownloadAction,
  UnitSearchResult,
  NyaaSearchResult,
  SearchDownloadReleaseContext,
  SearchDownloadRequest,
} from "@/domain/contracts";
import { brandMediaId } from "@bakarr/shared";

export function buildGrabInputFromNyaaResult(input: {
  mediaId: number;
  result: NyaaSearchResult;
  unitNumber?: number | undefined;
  isBatch?: boolean | null | undefined;
}): SearchDownloadRequest {
  const { mediaId, unitNumber, isBatch, result } = input;

  return {
    media_id: brandMediaId(mediaId),
    magnet: result.magnet,
    ...(unitNumber === undefined ? {} : { unit_number: unitNumber }),
    release_context: toReleaseContext({
      ...result,
      group: result.parsed_group,
      seadex_comparison:
        typeof result.seadex_comparison === "string" ? result.seadex_comparison : undefined,
    }),
    title: result.title,
    ...(isBatch ? { is_batch: true } : {}),
  };
}

export function buildGrabInputFromEpisodeResult(input: {
  mediaId: number;
  unitNumber: number;
  result: UnitSearchResult;
}): SearchDownloadRequest {
  return {
    media_id: brandMediaId(input.mediaId),
    unit_number: input.unitNumber,
    title: input.result.title,
    magnet: input.result.link,
    release_context: toReleaseContext(input.result, { includeDownloadAction: true }),
  };
}

export function actionReasonFromDownloadAction(action: DownloadAction) {
  if (action.Reject) return action.Reject.reason;
  if (action.Upgrade) return action.Upgrade.reason;
  return null;
}

interface ReleaseContextSource {
  indexer: string;
  group?: string | null | undefined;
  info_hash?: string | null | undefined;
  parsed_resolution?: string | null | undefined;
  trusted?: boolean | null | undefined;
  remake?: boolean | null | undefined;
  view_url?: string | null | undefined;
  is_seadex?: boolean | null | undefined;
  is_seadex_best?: boolean | null | undefined;
  seadex_release_group?: string | null | undefined;
  seadex_tags?: string[] | null | undefined;
  seadex_notes?: string | null | undefined;
  seadex_comparison?: string | null | undefined;
  seadex_dual_audio?: boolean | null | undefined;
  download_action?: DownloadAction | null | undefined;
}

function toReleaseContext(
  source: ReleaseContextSource,
  opts?: { includeDownloadAction?: boolean },
): SearchDownloadReleaseContext {
  return {
    ...(source.group == null ? {} : { group: source.group }),
    indexer: source.indexer,
    ...(source.info_hash == null ? {} : { info_hash: source.info_hash }),
    ...(source.parsed_resolution == null ? {} : { parsed_resolution: source.parsed_resolution }),
    ...(source.trusted == null ? {} : { trusted: source.trusted }),
    ...(source.remake == null ? {} : { remake: source.remake }),
    ...(source.view_url == null ? {} : { source_url: source.view_url }),
    ...(source.is_seadex == null ? {} : { is_seadex: source.is_seadex }),
    ...(source.is_seadex_best == null ? {} : { is_seadex_best: source.is_seadex_best }),
    ...(source.seadex_release_group == null
      ? {}
      : { seadex_release_group: source.seadex_release_group }),
    ...(source.seadex_tags == null ? {} : { seadex_tags: source.seadex_tags }),
    ...(source.seadex_notes == null ? {} : { seadex_notes: source.seadex_notes }),
    ...(source.seadex_comparison == null ? {} : { seadex_comparison: source.seadex_comparison }),
    ...(source.seadex_dual_audio == null ? {} : { seadex_dual_audio: source.seadex_dual_audio }),
    ...(source.download_action == null || !opts?.includeDownloadAction
      ? {}
      : { download_action: source.download_action }),
  };
}
