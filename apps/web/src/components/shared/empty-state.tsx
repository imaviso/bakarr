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
 * Implements the "Architectural Placeholder" design pattern.
 * Uses a hashed geometric background to look like an empty vault slot
 * waiting to be filled, rather than a broken or missing state.
 */
export function EmptyState(props: EmptyStateProps) {
  const inner = (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center text-center border border-border bg-muted overflow-hidden",
        props.compact ? "p-8 min-h-[160px]" : "p-12 min-h-[240px]",
        props.className,
      )}
    >
      {/* Architectural Hash Pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, var(--foreground) 0, var(--foreground) 1px, transparent 0, transparent 50%)`,
          backgroundSize: "8px 8px",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-4 max-w-sm">
        {props.icon ? (
          <div className="text-muted-foreground p-3 bg-background border border-border">
            {props.icon}
          </div>
        ) : null}
        <div>
          {(() => {
            const HeadingTag = `h${props.headingLevel ?? 3}` as "h1" | "h2" | "h3" | "h4";
            return (
              <HeadingTag className="text-sm font-medium tracking-tight text-foreground uppercase">
                {props.title}
              </HeadingTag>
            );
          })()}
          {props.description && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {props.description}
            </p>
          )}
        </div>
        {props.children && <div className="mt-2">{props.children}</div>}
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
