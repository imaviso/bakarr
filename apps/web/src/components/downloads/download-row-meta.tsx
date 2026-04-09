import { IconExternalLink, IconSparkles } from "@tabler/icons-solidjs";
import { Link } from "@tanstack/solid-router";
import type { DownloadSelectionKind } from "@bakarr/shared";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import type { ReleaseConfidenceMetadata } from "~/lib/release-selection";
import {
  releaseConfidenceBadgeClass,
  selectionKindBadgeClass,
  selectionKindLabel,
} from "~/lib/release-selection";

function animeInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

interface DownloadRowMetaProps {
  animeId?: number | undefined;
  animeImage?: string | undefined;
  animeTitle: string;
  confidence?: ReleaseConfidenceMetadata | undefined;
  decisionBadge?: string | undefined;
  decisionSummary?: string | undefined;
  downloadId?: number | undefined;
  errorMessage?: string | undefined;
  importedPath?: string | undefined;
  parsedSummary?: string | undefined;
  releaseName: string;
  releaseSummary?: string | undefined;
  selectionDetail?: string | undefined;
  selectionKind?: DownloadSelectionKind | undefined;
  sourceUrl?: string | undefined;
  trusted?: boolean | undefined;
  remake?: boolean | undefined;
  children?: JSX.Element;
}

export function DownloadRowMeta(props: DownloadRowMetaProps) {
  return (
    <div class="flex items-start gap-3">
      <Avatar class="size-8 rounded-md">
        <AvatarImage
          {...(props.animeImage === undefined ? {} : { src: props.animeImage })}
          alt={props.animeTitle}
        />
        <AvatarFallback class="rounded-md text-xs font-medium">
          {animeInitials(props.animeTitle)}
        </AvatarFallback>
      </Avatar>
      <div class="flex flex-col justify-center min-w-0">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <Show
            when={props.animeId !== undefined}
            fallback={<span class="line-clamp-1 min-w-0 max-w-full">{props.animeTitle}</span>}
          >
            {(animeId) => (
              <Link
                to="/anime/$id"
                params={{ id: animeId().toString() }}
                class="line-clamp-1 text-sm hover:underline min-w-0 max-w-full"
                title={props.animeTitle}
              >
                {props.animeTitle}
              </Link>
            )}
          </Show>
          <Show when={props.decisionBadge}>
            {(badge) => (
              <Badge variant="secondary" class="h-5 px-1.5 text-xs shrink-0">
                <IconSparkles class="h-3 w-3" />
                {badge()}
              </Badge>
            )}
          </Show>
        </div>
        <span class="line-clamp-1 text-xs text-muted-foreground" title={props.releaseName}>
          {props.releaseName}
        </span>
        <Show when={props.releaseSummary}>
          {(summary) => <span class="text-xs text-muted-foreground line-clamp-1">{summary()}</span>}
        </Show>
        <Show when={props.decisionSummary}>
          {(summary) => (
            <span class="text-[11px] text-muted-foreground line-clamp-1">{summary()}</span>
          )}
        </Show>
        <Show when={props.parsedSummary}>
          {(summary) => (
            <span class="text-[11px] text-muted-foreground line-clamp-1">{summary()}</span>
          )}
        </Show>
        <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
          <Show when={props.trusted}>
            <Badge variant="outline" class="h-4 px-1.5 border-success/20 bg-success/5 text-success">
              Trusted
            </Badge>
          </Show>
          <Show when={props.remake}>
            <Badge variant="outline" class="h-4 px-1.5 border-warning/20 bg-warning/5 text-warning">
              Remake
            </Badge>
          </Show>
          <Show when={props.sourceUrl}>
            {(sourceUrl) => (
              <a
                href={sourceUrl()}
                target="_blank"
                rel="noreferrer"
                class="inline-flex items-center gap-1 text-primary hover:text-primary/80"
              >
                <IconExternalLink class="h-3 w-3" /> Source
              </a>
            )}
          </Show>
        </div>
        <Show when={props.selectionKind || props.selectionDetail}>
          <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
            <Show when={selectionKindLabel(props.selectionKind)}>
              {(label) => (
                <Badge
                  variant="secondary"
                  class={`h-4 px-1.5 ${selectionKindBadgeClass(props.selectionKind)}`}
                >
                  {label()}
                </Badge>
              )}
            </Show>
            <Show when={props.selectionDetail}>
              {(detail) => <span class="text-muted-foreground/80 line-clamp-1">{detail()}</span>}
            </Show>
          </div>
        </Show>
        <Show when={props.confidence}>
          {(confidence) => (
            <div class="flex flex-wrap items-center gap-1.5 text-[11px] leading-tight">
              <Badge
                variant="secondary"
                class={`h-4 px-1.5 ${releaseConfidenceBadgeClass(confidence().tone)}`}
              >
                {confidence().label}
              </Badge>
              <span class="text-muted-foreground/80 line-clamp-1">{confidence().reason}</span>
            </div>
          )}
        </Show>
        {props.children}
        <Show when={props.importedPath}>
          {(importedPath) => (
            <span class="text-[11px] text-muted-foreground line-clamp-1">
              Imported to {importedPath()}
            </span>
          )}
        </Show>
        <Show when={props.errorMessage}>
          {(errorMessage) => (
            <span class="text-xs text-destructive line-clamp-1">{errorMessage()}</span>
          )}
        </Show>
        <Show when={props.downloadId !== undefined}>
          <span class="text-xs text-muted-foreground">#{props.downloadId}</span>
        </Show>
      </div>
    </div>
  );
}
