import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/infra/utils";

function Separator({ className, orientation = "horizontal", ...props }: SeparatorPrimitive.Props) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "shrink-0 border-border data-horizontal:w-full data-horizontal:border-t data-horizontal:border-dashed data-vertical:self-stretch data-vertical:border-l data-vertical:border-dashed",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
