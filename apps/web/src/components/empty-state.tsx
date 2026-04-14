import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { cn } from "~/lib/utils";

interface EmptyStateProps {
  icon?: (props: { class?: string }) => JSX.Element;
  title: string;
  description?: string;
  children?: JSX.Element;
  class?: string;
}

/**
 * Shared empty state component for consistent "no data" patterns.
 *
 * Uses dashed border card with centered icon + heading + body + optional CTA.
 */
export function EmptyState(props: EmptyStateProps) {
  return (
    <div class={cn("p-12 text-center border-2 border-dashed border-border", props.class)}>
      <div class="flex flex-col items-center gap-4">
        <Show when={props.icon}>
          {(icon) => <Dynamic component={icon()} class="h-12 w-12 text-muted-foreground/50" />}
        </Show>
        <div>
          <h3 class="font-medium">{props.title}</h3>
          <Show when={props.description}>
            <p class="text-sm text-muted-foreground mt-1">{props.description}</p>
          </Show>
        </div>
        {props.children}
      </div>
    </div>
  );
}
