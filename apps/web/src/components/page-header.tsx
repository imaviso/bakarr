import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <div className="border-b border-border pb-4 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{props.title}</h1>
        {props.subtitle && <p className="text-sm text-muted-foreground mt-1">{props.subtitle}</p>}
      </div>
      {props.children}
    </div>
  );
}
