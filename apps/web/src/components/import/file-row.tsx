import { IconAlertTriangle, IconCheck, IconFile, IconInfoCircle } from "@tabler/icons-solidjs";
import { createMemo, For, Show } from "solid-js";
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

type AnimeOption = (FileRowProps["animeList"][number] | FileRowProps["candidates"][number]) & {
  source: "library" | "candidate";
};

export function FileRow(props: FileRowProps) {
  const matchedAnimeId = () => props.file.matched_anime?.id || props.selectedAnimeId;
  const hasMatch = () => !!matchedAnimeId();

  const displayEpisode = () =>
    props.currentEpisode !== undefined
      ? props.currentEpisode
      : Math.floor(props.file.episode_number);
  const displaySeason = () =>
    props.currentSeason !== undefined ? props.currentSeason : props.file.season;

  const allOptions = createMemo<AnimeOption[]>(() => {
    const candidateOptions = props.candidates
      .filter((candidate) => !props.animeList.some((anime) => anime.id === candidate.id))
      .map((candidate) => Object.assign({}, candidate, { source: "candidate" as const }));

    return [
      ...props.animeList.map((anime) => Object.assign({}, anime, { source: "library" as const })),
      ...candidateOptions,
    ].toSorted((a, b) => {
      const titleA = a.title.english || a.title.romaji || "";
      const titleB = b.title.english || b.title.romaji || "";
      return titleA.localeCompare(titleB);
    });
  });
  const metadataBadges = createMemo(() => scannedFileMetadataBadges(props.file));
  const fileSize = createMemo(() => formatFileSize(props.file.size));
  const matchConfidence = createMemo(() => formatMatchConfidence(props.file.match_confidence));
  const decisionSummary = createMemo(() =>
    buildFileDecisionSummary({
      coverage_summary: props.file.coverage_summary,
      episode_conflict: props.file.episode_conflict,
      existing_mapping: props.file.existing_mapping,
      match_reason: props.file.match_reason,
      warnings: props.file.warnings,
    }),
  );
  const namingBadges = createMemo(() => namingMetadataBadges(props.file.naming_metadata_snapshot));

  return (
    <li
      class={cn(
        "px-8 py-3 transition-colors list-none",
        props.isSelected ? "bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <div class="flex items-center gap-4 min-w-0">
        <Checkbox
          checked={props.isSelected}
          disabled={!hasMatch()}
          aria-label={`Select ${props.file.filename}`}
          onChange={(checked) => {
            const id = matchedAnimeId();
            if (checked && id) {
              props.onToggle(id);
            } else if (!checked && id) {
              props.onToggle(id);
            }
          }}
          class="shrink-0"
        />
        <IconFile class="h-4 w-4 text-muted-foreground shrink-0" />
        <div class="flex-1 min-w-0 overflow-hidden">
          <span class="text-sm font-medium truncate block">{props.file.filename}</span>
          <Show when={props.file.episode_title || props.file.air_date}>
            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <Show when={props.file.episode_title}>
                <span class="truncate max-w-[28rem]">{props.file.episode_title}</span>
              </Show>
              <Show when={props.file.air_date}>
                <span>{props.file.air_date}</span>
              </Show>
              <Show when={fileSize()}>
                <span>{fileSize()}</span>
              </Show>
            </div>
          </Show>
          <Show when={!props.file.episode_title && !props.file.air_date && fileSize()}>
            <div class="mt-1 text-[11px] text-muted-foreground">{fileSize()}</div>
          </Show>
          <Show when={metadataBadges().length > 0}>
            <div class="mt-1 flex flex-wrap gap-1">
              <For each={metadataBadges()}>
                {(value) => (
                  <Badge variant="outline" class="h-5 px-1.5 text-xs">
                    {value}
                  </Badge>
                )}
              </For>
            </div>
          </Show>
          <Show
            when={
              props.file.coverage_summary ||
              props.file.existing_mapping ||
              props.file.episode_conflict
            }
          >
            <div class="mt-1 flex flex-wrap gap-1">
              <Show when={props.file.coverage_summary}>
                <Badge variant="secondary" class="h-5 px-1.5 text-xs">
                  {props.file.coverage_summary}
                </Badge>
              </Show>
              <Show when={props.file.existing_mapping}>
                <Badge variant="secondary" class="h-5 px-1.5 text-xs">
                  Already mapped
                </Badge>
              </Show>
              <Show when={props.file.episode_conflict}>
                <Badge
                  variant="secondary"
                  class="h-5 px-1.5 text-xs bg-warning/10 text-warning border-warning/20"
                >
                  Duplicate episode
                </Badge>
              </Show>
            </div>
          </Show>
          <Show when={props.file.match_reason}>
            <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Show when={matchConfidence()}>
                <Badge variant="outline" class="h-5 px-1.5 text-xs">
                  {matchConfidence()}
                </Badge>
              </Show>
              <p class="truncate">{props.file.match_reason}</p>
            </div>
          </Show>
          <Show when={decisionSummary().length > 0}>
            <div class="mt-1 space-y-0.5">
              <For each={decisionSummary()}>
                {(detail) => (
                  <p
                    class={cn(
                      "text-[11px]",
                      detail.startsWith("Existing file") || props.file.warnings?.includes(detail)
                        ? "text-warning"
                        : "text-muted-foreground",
                    )}
                  >
                    {detail}
                  </p>
                )}
              </For>
            </div>
          </Show>
          <Show
            when={
              props.file.naming_filename ||
              props.file.naming_format_used ||
              props.file.naming_fallback_used ||
              namingBadges().length > 0 ||
              props.file.naming_warnings?.length ||
              props.file.naming_missing_fields?.length
            }
          >
            <div class="mt-2 space-y-1">
              <Show when={props.file.naming_filename}>
                <p class="text-[11px] text-muted-foreground">
                  Will import as {props.file.naming_filename}
                </p>
              </Show>
              <div class="flex flex-wrap gap-1">
                <Show when={props.file.naming_fallback_used}>
                  <Badge
                    variant="outline"
                    class="h-5 px-1.5 text-xs border-warning/30 text-warning"
                  >
                    Fallback naming
                  </Badge>
                </Show>
                <Show when={props.file.naming_format_used}>
                  <Badge variant="secondary" class="h-5 px-1.5 text-xs font-mono">
                    {props.file.naming_format_used}
                  </Badge>
                </Show>
                <Show
                  when={formatNamingTitleSource(props.file.naming_metadata_snapshot?.title_source)}
                >
                  {(label) => (
                    <Badge variant="secondary" class="h-5 px-1.5 text-xs">
                      {label()}
                    </Badge>
                  )}
                </Show>
                <For each={namingBadges()}>
                  {(value) => (
                    <Badge variant="outline" class="h-5 px-1.5 text-xs">
                      {value}
                    </Badge>
                  )}
                </For>
              </div>
              <Show
                when={
                  props.file.naming_warnings?.length || props.file.naming_missing_fields?.length
                }
              >
                <div class="space-y-0.5 text-[11px] text-muted-foreground">
                  <For each={props.file.naming_warnings || []}>
                    {(warning) => (
                      <p class="flex items-start gap-1">
                        <IconAlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        <span>{warning}</span>
                      </p>
                    )}
                  </For>
                  <For each={props.file.naming_missing_fields || []}>
                    {(field) => (
                      <p class="flex items-start gap-1">
                        <IconInfoCircle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>Missing naming field `{field}`</span>
                      </p>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <Show when={props.file.source_identity?.label}>
            <Badge variant="outline" class="text-xs font-mono">
              {props.file.source_identity?.label}
            </Badge>
          </Show>
          <Show
            when={
              !props.file.source_identity?.label &&
              formatEpisodeNumberList(props.file.episode_numbers)
            }
          >
            <Badge variant="outline" class="text-xs font-mono">
              {formatEpisodeNumberList(props.file.episode_numbers)}
            </Badge>
          </Show>
          <EditMappingPopover
            episode={displayEpisode()}
            season={displaySeason() ?? null}
            onSave={props.onMappingChange}
          />
          <Show when={props.file.needs_manual_mapping}>
            <Badge variant="secondary" class="text-xs bg-warning/10 text-warning border-warning/20">
              Manual
            </Badge>
          </Show>
        </div>
        <div class="flex items-center gap-2 shrink-0 w-64">
          <Show
            when={hasMatch()}
            fallback={
              <>
                <IconAlertTriangle class="h-4 w-4 text-warning shrink-0" />
                <Select
                  value={null}
                  onChange={(v) => {
                    if (v) {
                      const newId = v.id;
                      props.onToggle(newId);
                    }
                  }}
                  options={allOptions()}
                  optionValue={(opt) => opt?.id ?? -1}
                  optionTextValue={(opt) =>
                    opt?.title.english || opt?.title.romaji || "Unknown Title"
                  }
                  placeholder="Select anime..."
                  itemComponent={(itemProps) => (
                    <SelectItem item={itemProps.item}>
                      <span class="flex items-center gap-2">
                        {itemProps.item.rawValue?.title.english ||
                          itemProps.item.rawValue?.title.romaji}
                        <Show when={itemProps.item.rawValue?.source === "candidate"}>
                          <Badge variant="secondary" class="h-4 px-1 text-xs">
                            New
                          </Badge>
                        </Show>
                      </span>
                    </SelectItem>
                  )}
                >
                  <SelectTrigger class="h-8 text-xs flex-1">
                    <SelectValue<AnimeOption>>
                      {(_state) => <span class="text-muted-foreground">Select anime...</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </>
            }
          >
            <IconCheck class="h-4 w-4 text-success shrink-0" />
            <Select
              value={allOptions().find((o) => o.id === (props.selectedAnimeId || matchedAnimeId()))}
              onChange={(v) => {
                if (v) {
                  const newId = v.id;
                  props.onAnimeChange(newId);
                  if (!props.isSelected) {
                    props.onToggle(newId);
                  }
                }
              }}
              options={allOptions()}
              optionValue={(opt) => opt?.id ?? -1}
              optionTextValue={(opt) => opt?.title.english || opt?.title.romaji || "Unknown Title"}
              itemComponent={(itemProps) => (
                <SelectItem item={itemProps.item}>
                  <span class="flex items-center gap-2">
                    {itemProps.item.rawValue?.title.english ||
                      itemProps.item.rawValue?.title.romaji}
                    <Show when={itemProps.item.rawValue?.source === "candidate"}>
                      <Badge variant="secondary" class="h-4 px-1 text-xs">
                        New
                      </Badge>
                    </Show>
                  </span>
                </SelectItem>
              )}
            >
              <SelectTrigger class="h-8 text-xs flex-1">
                <SelectValue<AnimeOption>>
                  {(state) =>
                    state.selectedOption()?.title.english ||
                    state.selectedOption()?.title.romaji ||
                    `ID: ${props.selectedAnimeId || matchedAnimeId()}`
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </Show>
        </div>
      </div>
    </li>
  );
}
