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
    <div className={cn("flex flex-wrap items-center justify-between gap-3", props.className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="font-mono text-base font-medium tracking-tight text-foreground">
          {props.title}
        </h1>
        {props.subtitle && (
          <p className="font-mono text-xs text-muted-foreground">{props.subtitle}</p>
        )}
      </div>
      {props.children}
    </div>
  );
}
