import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import * as TooltipPrimitive from "@kobalte/core/tooltip";

import { cn } from "~/lib/utils";

const TooltipTrigger = TooltipPrimitive.Trigger;

const Tooltip: Component<TooltipPrimitive.TooltipRootProps> = (props) => {
  return <TooltipPrimitive.Root gutter={4} {...props} />;
};

type TooltipContentProps = ComponentProps<typeof TooltipPrimitive.Content> & {
  class?: string | undefined;
};

const TooltipContent: Component<TooltipContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        class={cn(
          "z-50 origin-[var(--kb-popover-content-transform-origin)] overflow-hidden rounded-none border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-sm animate-in fade-in-0 zoom-in-95",
          local.class,
        )}
        {...others}
      />
    </TooltipPrimitive.Portal>
  );
};

export { Tooltip, TooltipContent, TooltipTrigger };
