import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface EmptyStateProps {
  icon?: (props: { className?: string }) => ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Shared empty state component for consistent "no data" patterns.
 *
 * Uses dashed border card with centered icon + heading + body + optional CTA.
 */
export function EmptyState(props: EmptyStateProps) {
  const Icon = props.icon;

  return (
    <div className={cn("p-12 text-center border-2 border-dashed border-border", props.className)}>
      <div className="flex flex-col items-center gap-4">
        {Icon ? <Icon className="h-12 w-12 text-muted-foreground" /> : null}
        <div>
          <h3 className="font-medium">{props.title}</h3>
          {props.description && (
            <p className="text-sm text-muted-foreground mt-1">{props.description}</p>
          )}
        </div>
        {props.children}
      </div>
    </div>
  );
}
