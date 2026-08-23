import { cn } from "@/infra/utils";
import { SpinnerIcon, type IconProps } from "@phosphor-icons/react";

function Spinner({ className, ...props }: IconProps) {
  return (
    <SpinnerIcon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
