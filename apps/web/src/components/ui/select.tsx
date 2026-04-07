import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import * as SelectPrimitive from "@kobalte/core/select";
import { cva } from "class-variance-authority";

import { cn } from "~/lib/utils";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;
const SelectHiddenSelect = SelectPrimitive.HiddenSelect;

type SelectTriggerProps = ComponentProps<typeof SelectPrimitive.Trigger> & {
  class?: string | undefined;
};

const SelectTrigger: Component<SelectTriggerProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <SelectPrimitive.Trigger
      class={cn(
        "flex h-9 w-full items-center justify-between rounded-none border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
        local.class,
      )}
      {...others}
    >
      {local.children}
      <SelectPrimitive.Icon
        as="svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="size-4 opacity-50"
      >
        <path d="M8 9l4 -4l4 4" />
        <path d="M16 15l-4 4l-4 -4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
};

type SelectContentProps = ComponentProps<typeof SelectPrimitive.Content> & {
  class?: string | undefined;
};

const SelectContent: Component<SelectContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        class={cn(
          "relative z-50 min-w-32 max-h-[20rem] overflow-y-auto overflow-x-hidden rounded-none border border-border bg-popover text-popover-foreground shadow-sm animate-in fade-in-80",
          local.class,
        )}
        {...others}
      >
        <SelectPrimitive.Listbox class="m-0 p-1" />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
};

type SelectItemProps = ComponentProps<typeof SelectPrimitive.Item> & {
  class?: string | undefined;
};

const SelectItem: Component<SelectItemProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <SelectPrimitive.Item
      class={cn(
        "relative mt-0 flex w-full cursor-default select-none items-center rounded-none py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        local.class,
      )}
      {...others}
    >
      <SelectPrimitive.ItemIndicator class="absolute right-2 flex size-3.5 items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-4"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />
          <path d="M5 12l5 5l10 -10" />
        </svg>
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemLabel>{local.children}</SelectPrimitive.ItemLabel>
    </SelectPrimitive.Item>
  );
};

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
  {
    variants: {
      variant: {
        label: "data-[invalid]:text-destructive",
        description: "font-normal text-muted-foreground",
        error: "text-xs text-destructive",
      },
    },
    defaultVariants: {
      variant: "label",
    },
  },
);

type SelectLabelProps = ComponentProps<typeof SelectPrimitive.Label> & {
  class?: string | undefined;
};

const SelectLabel: Component<SelectLabelProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <SelectPrimitive.Label class={cn(labelVariants(), local.class)} {...others} />;
};

type SelectDescriptionProps = ComponentProps<typeof SelectPrimitive.Description> & {
  class?: string | undefined;
};

const SelectDescription: Component<SelectDescriptionProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SelectPrimitive.Description
      class={cn(labelVariants({ variant: "description" }), local.class)}
      {...others}
    />
  );
};

type SelectErrorMessageProps = ComponentProps<typeof SelectPrimitive.ErrorMessage> & {
  class?: string | undefined;
};

const SelectErrorMessage: Component<SelectErrorMessageProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SelectPrimitive.ErrorMessage
      class={cn(labelVariants({ variant: "error" }), local.class)}
      {...others}
    />
  );
};

export {
  Select,
  SelectContent,
  SelectDescription,
  SelectErrorMessage,
  SelectHiddenSelect,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
};
