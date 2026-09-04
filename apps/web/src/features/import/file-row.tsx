import { RiCheckLine, RiErrorWarningLine, RiFileLine, RiInformationLine } from "@remixicon/react";
import { EditMappingPopover } from "@/features/media/edit-mapping-popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildFileDecisionSummary,
  formatEpisodeNumberList,
  formatFileSize,
  formatMatchConfidence,
  formatNamingTitleSource,
  mediaMetadataBadges,
  namingMetadataBadges,
} from "@/domain/scanned-file";
import { cn } from "@/infra/utils";
import type { FileRowProps } from "./types";

export function FileRow(props: FileRowProps) {
  const matchedAnimeId = props.file.matched_media?.id || props.selectedAnimeId;
  const hasMatch = !!matchedAnimeId;

  const displayEpisode = props.currentEpisode ?? Math.floor(props.file.unit_number);
  const displaySeason = props.currentSeason ?? props.file.season;

  const metadataBadges = mediaMetadataBadges(props.file);
  const fileSize = formatFileSize(props.file.size);
  const matchConfidence = formatMatchConfidence(props.file.match_confidence ?? undefined);
  const decisionSummary = buildFileDecisionSummary({
    coverage_summary: props.file.coverage_summary,
    unit_conflict: props.file.unit_conflict,
    existing_mapping: props.file.existing_mapping,
    match_reason: props.file.match_reason,
    warnings: props.file.warnings,
  });
  const namingBadges = namingMetadataBadges(props.file.naming_metadata_snapshot);

  return (
    <li
      className={cn(
        "px-8 py-3 transition-colors list-none",
        props.isSelected ? "bg-primary/10" : "hover:bg-muted",
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        <Checkbox
          isSelected={props.isSelected}
          isDisabled={!hasMatch}
          aria-label={`Select ${props.file.filename}`}
          onChange={() => {
            if (matchedAnimeId) {
              props.onToggle(matchedAnimeId);
            }
          }}
          className="shrink-0"
        />
        <RiFileLine className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0 overflow-hidden">
          <span className="text-sm font-medium truncate block">{props.file.filename}</span>
          {(props.file.unit_title || props.file.air_date) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {props.file.unit_title && (
                <span className="truncate max-w-[28rem]">{props.file.unit_title}</span>
              )}
              {props.file.air_date && <span>{props.file.air_date}</span>}
              {fileSize !== undefined && <span>{fileSize}</span>}
            </div>
          )}
          {!props.file.unit_title && !props.file.air_date && fileSize !== undefined && (
            <div className="mt-1 text-xs text-muted-foreground">{fileSize}</div>
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
            props.file.unit_conflict) && (
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
              {props.file.unit_conflict && <Badge variant="outline">Duplicate episode</Badge>}
            </div>
          )}
          {props.file.match_reason && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
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
              {(() => {
                const warnings = new Set(props.file.warnings ?? []);
                return decisionSummary.map((detail) => (
                  <p
                    key={detail}
                    className={cn(
                      "text-xs",
                      detail.startsWith("Existing file") || warnings.has(detail)
                        ? "text-warning"
                        : "text-muted-foreground",
                    )}
                  >
                    {detail}
                  </p>
                ));
              })()}
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
                <p className="text-xs text-muted-foreground">
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
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {(props.file.naming_warnings || []).map((warning) => (
                    <p key={warning} className="flex items-start gap-1">
                      <RiErrorWarningLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                      <span>{warning}</span>
                    </p>
                  ))}
                  {(props.file.naming_missing_fields || []).map((field) => (
                    <p key={field} className="flex items-start gap-1">
                      <RiInformationLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
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
            formatEpisodeNumberList(props.file.unit_numbers) && (
              <Badge variant="outline" className="text-xs font-mono">
                {formatEpisodeNumberList(props.file.unit_numbers)}
              </Badge>
            )}
          <EditMappingPopover
            episode={displayEpisode}
            season={displaySeason ?? undefined}
            disabled={!props.isSelected}
            onSave={props.onMappingChange}
          />
          {props.file.needs_manual_mapping && <Badge variant="outline">Manual</Badge>}
        </div>
        <div className="flex items-center gap-2 shrink-0 w-64">
          {hasMatch ? (
            <>
              <RiCheckLine className="h-4 w-4 text-success shrink-0" />
              <Select
                selectedKey={String(props.selectedAnimeId || matchedAnimeId)}
                onSelectionChange={(value) => {
                  if (value === null) {
                    return;
                  }
                  const newId = props.animeOptions.find(
                    (option) => String(option.id) === String(value),
                  )?.id;
                  if (newId !== undefined) {
                    props.onAnimeChange(newId);
                    if (!props.isSelected) {
                      props.onToggle(newId);
                    }
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.animeOptions.map((option) => (
                    <SelectItem
                      key={option.id}
                      id={String(option.id)}
                      textValue={option.title.english || option.title.romaji}
                    >
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
              <RiErrorWarningLine className="h-4 w-4 text-warning shrink-0" />
              <Select
                selectedKey={null}
                onSelectionChange={(value) => {
                  if (value === null) {
                    return;
                  }
                  const newId = props.animeOptions.find(
                    (option) => String(option.id) === String(value),
                  )?.id;
                  if (newId !== undefined) {
                    props.onToggle(newId);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {props.animeOptions.map((option) => (
                    <SelectItem
                      key={option.id}
                      id={String(option.id)}
                      textValue={option.title.english || option.title.romaji}
                    >
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
