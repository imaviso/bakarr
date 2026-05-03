import type { ReactNode } from "react";
import { TableCell, TableRow } from "~/components/ui/table";
import { cn } from "~/infra/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  asTableCell?: boolean;
  colSpan?: number;
  headingLevel?: 1 | 2 | 3 | 4;
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
        "text-center border-2 border-border",
        props.compact ? "p-8" : "p-12",
        props.className,
      )}
    >
      <div className="flex flex-col items-center gap-4">
        {props.icon ? <div className="text-muted-foreground">{props.icon}</div> : null}
        <div>
          {(() => {
            const HeadingTag = `h${props.headingLevel ?? 3}` as "h1" | "h2" | "h3" | "h4";
            return <HeadingTag className="font-medium">{props.title}</HeadingTag>;
          })()}
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
      <TableRow>
        <TableCell colSpan={props.colSpan} className="h-32 text-center p-0">
          {inner}
        </TableCell>
      </TableRow>
    );
  }

  return inner;
}
