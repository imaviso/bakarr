import type { Component, ComponentProps, JSX } from "solid-js";
import { splitProps } from "solid-js";

import * as SwitchPrimitive from "@kobalte/core/switch";

import { cn } from "~/lib/utils";

const SwitchRoot = SwitchPrimitive.Root;
const SwitchDescription = SwitchPrimitive.Description;
const SwitchErrorMessage = SwitchPrimitive.ErrorMessage;

type SwitchControlProps = ComponentProps<typeof SwitchPrimitive.Control> & {
  class?: string | undefined;
  children?: JSX.Element;
};

const SwitchControl: Component<SwitchControlProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <>
      <SwitchPrimitive.Input
        class="[&:focus-visible+div]:outline-none [&:focus-visible+div]:ring-2 [&:focus-visible+div]:ring-ring [&:focus-visible+div]:ring-offset-2 [&:focus-visible+div]:ring-offset-background"
      />
      <SwitchPrimitive.Control
        class={cn(
          "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input transition-[color,background-color,box-shadow] data-[disabled]:cursor-not-allowed data-[checked]:bg-primary data-[disabled]:opacity-50",
          local.class,
        )}
        {...others}
      >
        {local.children}
      </SwitchPrimitive.Control>
    </>
  );
};

type SwitchThumbProps = ComponentProps<typeof SwitchPrimitive.Thumb> & {
  class?: string | undefined;
};

const SwitchThumb: Component<SwitchThumbProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SwitchPrimitive.Thumb
      class={cn(
        "pointer-events-none block size-5 translate-x-0 rounded-full bg-background shadow-sm ring-0 transition-transform data-[checked]:translate-x-5",
        local.class,
      )}
      {...others}
    />
  );
};

type SwitchLabelProps = ComponentProps<typeof SwitchPrimitive.Label> & {
  class?: string | undefined;
};

const SwitchLabel: Component<SwitchLabelProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SwitchPrimitive.Label
      class={cn(
        "text-sm font-medium leading-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70",
        local.class,
      )}
      {...others}
    />
  );
};

type SwitchProps = SwitchPrimitive.SwitchRootProps & {
  class?: string | undefined;
};

const Switch: Component<SwitchProps> = (props) => {
  const [local, others] = splitProps(props, ["children", "class"]);
  return (
    <SwitchRoot {...others}>
      <SwitchControl class={local.class}>
        <SwitchThumb />
      </SwitchControl>
      {typeof local.children === "function" ? local.children(SwitchPrimitive.useSwitchContext()) : local.children}
    </SwitchRoot>
  );
};

export {
  Switch,
  SwitchControl,
  SwitchDescription,
  SwitchErrorMessage,
  SwitchLabel,
  SwitchRoot,
  SwitchThumb,
};
