import { cn } from "~/lib/utils";

interface SectionLabelProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionLabel(props: SectionLabelProps) {
  return (
    <span
      className={cn(
        "text-xs font-semibold uppercase tracking-widest text-muted-foreground",
        props.className,
      )}
    >
      {props.children}
    </span>
  );
}
