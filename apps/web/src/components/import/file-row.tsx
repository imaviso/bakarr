import { WarningIcon, CheckIcon, FileIcon, InfoIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { EditMappingPopover } from "~/components/edit-mapping-popover";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  buildFileDecisionSummary,
  formatEpisodeNumberList,
  formatFileSize,
  formatMatchConfidence,
  formatNamingTitleSource,
  namingMetadataBadges,
  scannedFileMetadataBadges,
} from "~/lib/scanned-file";
import { cn } from "~/lib/utils";
import type { FileRowProps } from "./types";

export function FileRow(props: FileRowProps) {
  const matchedAnimeId = props.file.matched_anime?.id || props.selectedAnimeId;
  const hasMatch = !!matchedAnimeId;

  const displayEpisode =
    props.currentEpisode !== undefined
      ? props.currentEpisode
      : Math.floor(props.file.episode_number);
  const displaySeason = props.currentSeason !== undefined ? props.currentSeason : props.file.season;

  const metadataBadges = useMemo(() => scannedFileMetadataBadges(props.file), [props.file]);
  const fileSize = useMemo(() => formatFileSize(props.file.size), [props.file.size]);
  const matchConfidence = useMemo(
    () => formatMatchConfidence(props.file.match_confidence),
    [props.file.match_confidence],
  );
  const decisionSummary = useMemo(
    () =>
      buildFileDecisionSummary({
        coverage_summary: props.file.coverage_summary,
        episode_conflict: props.file.episode_conflict,
        existing_mapping: props.file.existing_mapping,
        match_reason: props.file.match_reason,
        warnings: props.file.warnings,
      }),
    [
      props.file.coverage_summary,
      props.file.episode_conflict,
      props.file.existing_mapping,
      props.file.match_reason,
      props.file.warnings,
    ],
  );
  const namingBadges = useMemo(
    () => namingMetadataBadges(props.file.naming_metadata_snapshot),
    [props.file.naming_metadata_snapshot],
  );

  return (
    <li
      className={cn(
        "px-8 py-3 transition-colors list-none",
        props.isSelected ? "bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        <Checkbox
          checked={props.isSelected}
          disabled={!hasMatch}
          aria-label={`Select ${props.file.filename}`}
          onCheckedChange={(checked) => {
            const id = matchedAnimeId;
            if (checked && id) {
              props.onToggle(id);
            } else if (!checked && id) {
              props.onToggle(id);
            }
          }}
          className="shrink-0"
        />
        <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0 overflow-hidden">
          <span className="text-sm font-medium truncate block">{props.file.filename}</span>
          {(props.file.episode_title || props.file.air_date) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {props.file.episode_title && (
                <span className="truncate max-w-[28rem]">{props.file.episode_title}</span>
              )}
              {props.file.air_date && <span>{props.file.air_date}</span>}
              {fileSize && <span>{fileSize}</span>}
            </div>
          )}
          {!props.file.episode_title && !props.file.air_date && fileSize && (
            <div className="mt-1 text-[11px] text-muted-foreground">{fileSize}</div>
          )}
          {metadataBadges.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {metadataBadges.map((value) => (
                <Badge key={value} variant="outline" className="h-5 px-1.5 text-xs">
                  {value}
                </Badge>
              ))}
            </div>
          )}
          {(props.file.coverage_summary ||
            props.file.existing_mapping ||
            props.file.episode_conflict) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {props.file.coverage_summary && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {props.file.coverage_summary}
                </Badge>
              )}
              {props.file.existing_mapping && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  Already mapped
                </Badge>
              )}
              {props.file.episode_conflict && (
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-xs bg-warning/10 text-warning border-warning/20"
                >
                  Duplicate episode
                </Badge>
              )}
            </div>
          )}
          {props.file.match_reason && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              {matchConfidence && (
                <Badge variant="outline" className="h-5 px-1.5 text-xs">
                  {matchConfidence}
                </Badge>
              )}
              <p className="truncate">{props.file.match_reason}</p>
            </div>
          )}
          {decisionSummary.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {decisionSummary.map((detail) => (
                <p
                  key={detail}
                  className={cn(
                    "text-[11px]",
                    detail.startsWith("Existing file") || props.file.warnings?.includes(detail)
                      ? "text-warning"
                      : "text-muted-foreground",
                  )}
                >
                  {detail}
                </p>
              ))}
            </div>
          )}
          {(props.file.naming_filename ||
            props.file.naming_format_used ||
            props.file.naming_fallback_used ||
            namingBadges.length > 0 ||
            props.file.naming_warnings?.length ||
            props.file.naming_missing_fields?.length) && (
            <div className="mt-2 space-y-1">
              {props.file.naming_filename && (
                <p className="text-[11px] text-muted-foreground">
                  Will import as {props.file.naming_filename}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {props.file.naming_fallback_used && (
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-xs border-warning/30 text-warning"
                  >
                    Fallback naming
                  </Badge>
                )}
                {props.file.naming_format_used && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs font-mono">
                    {props.file.naming_format_used}
                  </Badge>
                )}
                {formatNamingTitleSource(props.file.naming_metadata_snapshot?.title_source) && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {formatNamingTitleSource(props.file.naming_metadata_snapshot?.title_source)}
                  </Badge>
                )}
                {namingBadges.map((value) => (
                  <Badge key={value} variant="outline" className="h-5 px-1.5 text-xs">
                    {value}
                  </Badge>
                ))}
              </div>
              {(props.file.naming_warnings?.length || props.file.naming_missing_fields?.length) && (
                <div className="space-y-0.5 text-[11px] text-muted-foreground">
                  {(props.file.naming_warnings || []).map((warning) => (
                    <p key={warning} className="flex items-start gap-1">
                      <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <span>{warning}</span>
                    </p>
                  ))}
                  {(props.file.naming_missing_fields || []).map((field) => (
                    <p key={field} className="flex items-start gap-1">
                      <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>Missing naming field `{field}`</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {props.file.source_identity?.label && (
            <Badge variant="outline" className="text-xs font-mono">
              {props.file.source_identity?.label}
            </Badge>
          )}
          {!props.file.source_identity?.label &&
            formatEpisodeNumberList(props.file.episode_numbers) && (
              <Badge variant="outline" className="text-xs font-mono">
                {formatEpisodeNumberList(props.file.episode_numbers)}
              </Badge>
            )}
          <EditMappingPopover
            episode={displayEpisode}
            season={displaySeason ?? null}
            onSave={props.onMappingChange}
          />
          {props.file.needs_manual_mapping && (
            <Badge
              variant="secondary"
              className="text-xs bg-warning/10 text-warning border-warning/20"
            >
              Manual
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 w-64">
          {hasMatch ? (
            <>
              <CheckIcon className="h-4 w-4 text-success shrink-0" />
              <Select
                value={String(props.selectedAnimeId || matchedAnimeId)}
                onValueChange={(value) => {
                  const newId = Number(value);
                  if (!Number.isNaN(newId)) {
                    props.onAnimeChange(newId);
                    if (!props.isSelected) {
                      props.onToggle(newId);
                    }
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder={`ID: ${props.selectedAnimeId || matchedAnimeId}`} />
                </SelectTrigger>
                <SelectContent>
                  {props.animeOptions.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      <span className="flex items-center gap-2">
                        {option.title.english || option.title.romaji}
                        {option.source === "candidate" && (
                          <Badge variant="secondary" className="h-4 px-1 text-xs">
                            New
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : (
            <>
              <WarningIcon className="h-4 w-4 text-warning shrink-0" />
              <Select
                value={undefined}
                onValueChange={(value) => {
                  const newId = Number(value);
                  if (!Number.isNaN(newId)) {
                    props.onToggle(newId);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Select anime..." />
                </SelectTrigger>
                <SelectContent>
                  {props.animeOptions.map((option) => (
                    <SelectItem key={option.id} value={String(option.id)}>
                      <span className="flex items-center gap-2">
                        {option.title.english || option.title.romaji}
                        {option.source === "candidate" && (
                          <Badge variant="secondary" className="h-4 px-1 text-xs">
                            New
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
