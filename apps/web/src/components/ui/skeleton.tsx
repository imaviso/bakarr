import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import * as SkeletonPrimitive from "@kobalte/core/skeleton";

import { cn } from "~/lib/utils";

type SkeletonRootProps = ComponentProps<typeof SkeletonPrimitive.Root> & {
  class?: string | undefined;
};

const Skeleton: Component<SkeletonRootProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SkeletonPrimitive.Root
      class={cn("bg-primary/10 data-[animate='true']:animate-pulse", local.class)}
      {...others}
    />
  );
};

export { Skeleton };
