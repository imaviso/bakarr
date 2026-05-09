import type { ReactNode } from "react";
import { cn } from "~/infra/utils";

type Scroll = "page" | "inner";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  scroll?: Scroll;
}

export function PageShell(props: PageShellProps) {
  const scroll: Scroll = props.scroll ?? "page";
  return (
    <div
      data-page-shell={scroll}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-4",
        scroll === "page" ? "overflow-x-hidden overflow-y-auto" : "overflow-hidden",
        props.className,
      )}
    >
      {props.children}
    </div>
  );
}
