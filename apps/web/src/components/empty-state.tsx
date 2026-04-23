import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  asTableCell?: boolean;
  colSpan?: number;
}

/**
 * Shared empty state component for consistent "no data" patterns.
 *
 * Uses dashed border card with centered icon + heading + body + optional CTA.
 * Set `asTableCell` to render inside a `<td>` for table contexts.
 */
export function EmptyState(props: EmptyStateProps) {
  const inner = (
    <div
      className={cn(
        "text-center border-2 border-dashed border-border",
        props.compact ? "p-8" : "p-12",
        props.className,
      )}
    >
      <div className="flex flex-col items-center gap-4">
        {props.icon ? <div className="text-muted-foreground">{props.icon}</div> : null}
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

  if (props.asTableCell) {
    return (
      <tr>
        <td colSpan={props.colSpan} className="h-32 text-center p-0">
          {inner}
        </td>
      </tr>
    );
  }

  return inner;
}
