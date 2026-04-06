import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import * as SeparatorPrimitive from "@kobalte/core/separator";

import { cn } from "~/lib/utils";

type SeparatorRootProps = ComponentProps<typeof SeparatorPrimitive.Root> & {
  class?: string | undefined;
};

const Separator: Component<SeparatorRootProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "orientation"]);
  return (
    <SeparatorPrimitive.Root
      orientation={local.orientation ?? "horizontal"}
      class={cn(
        "shrink-0 bg-border",
        local.orientation === "vertical" ? "h-full w-px" : "h-px w-full",
        local.class,
      )}
      {...others}
    />
  );
};

export { Separator };
