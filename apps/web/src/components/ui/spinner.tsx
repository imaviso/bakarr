import { cn } from "@/infra/utils";
import { RiLoader4Line } from "@remixicon/react";

function Spinner(props: React.ComponentProps<typeof RiLoader4Line>) {
  return (
    <RiLoader4Line
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", props.className)}
      {...props}
    />
  );
}

export { Spinner };
