import type { JSX } from "solid-js";
import { Show } from "solid-js";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: JSX.Element;
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <div class="border-b border-border pb-4 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-foreground">
          {props.title}
        </h1>
        <Show when={props.subtitle}>
          <p class="text-sm text-muted-foreground mt-1">
            {props.subtitle}
          </p>
        </Show>
      </div>
      {props.children}
    </div>
  );
}
