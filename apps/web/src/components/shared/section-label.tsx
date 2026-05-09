import { createElement, type ReactNode } from "react";
import { cn } from "~/infra/utils";

type Tag = "span" | "h2" | "h3" | "h4" | "div";

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  as?: Tag;
}

export function SectionLabel(props: SectionLabelProps) {
  return createElement(
    props.as ?? "span",
    {
      className: cn(
        "font-mono text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground",
        props.className,
      ),
    },
    props.children,
  );
}
