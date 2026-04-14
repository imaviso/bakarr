import type { Component, ComponentProps, JSX } from "solid-js";
import { splitProps } from "solid-js";

import * as ProgressPrimitive from "@kobalte/core/progress";

import { Label } from "~/components/ui/label";

type ProgressRootProps = ComponentProps<typeof ProgressPrimitive.Root> & {
  children?: JSX.Element;
};

const Progress: Component<ProgressRootProps> = (props) => {
  const [local, others] = splitProps(props, ["children"]);
  return (
    <ProgressPrimitive.Root {...others}>
      {local.children}
      <ProgressPrimitive.Track class="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <ProgressPrimitive.Fill class="h-full w-[var(--kb-progress-fill-width)] flex-1 bg-primary transition-[width] duration-300 ease-out will-change-[width]" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
};

const ProgressLabel: Component<ProgressPrimitive.ProgressLabelProps> = (props) => {
  return <ProgressPrimitive.Label as={Label} {...props} />;
};

const ProgressValueLabel: Component<ProgressPrimitive.ProgressValueLabelProps> = (props) => {
  return <ProgressPrimitive.ValueLabel as={Label} {...props} />;
};

export { Progress, ProgressLabel, ProgressValueLabel };
