import type { ReactNode } from "react";
import { cn } from "@/infra/utils";

/**
 * Fixed 2:3 poster box. `bg-muted` shows while artwork loads; `skeleton`
 * swaps the box for a shimmer placeholder.
 */
export function Poster(props: { children?: ReactNode; className?: string; skeleton?: boolean }) {
  const box = props.skeleton
    ? "aspect-2/3 w-full"
    : "relative aspect-2/3 w-full overflow-hidden bg-muted";

  return <div className={cn(box, props.className)}>{props.children}</div>;
}
