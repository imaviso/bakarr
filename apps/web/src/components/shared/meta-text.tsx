import { cn } from "@/infra/utils";

interface MetaTextProps {
  children: React.ReactNode;
  className?: string;
}

export function MetaText(props: MetaTextProps) {
  return (
    <span className={cn("text-xs text-muted-foreground", props.className)}>{props.children}</span>
  );
}

export function MetaLine(props: MetaTextProps) {
  return (
    <div className={cn("text-xs text-muted-foreground", props.className)}>{props.children}</div>
  );
}
