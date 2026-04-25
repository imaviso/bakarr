import type { ReactNode } from "react";
import { cn } from "~/infra/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 py-2", props.className)}>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{props.title}</h1>
        {props.subtitle && <p className="text-xs text-muted-foreground">{props.subtitle}</p>}
      </div>
      {props.children}
    </div>
  );
}
