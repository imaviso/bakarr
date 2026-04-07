import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import * as ContextMenuPrimitive from "@kobalte/core/context-menu";

import { cn } from "~/lib/utils";

const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuPortal = ContextMenuPrimitive.Portal;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const ContextMenu: Component<ContextMenuPrimitive.ContextMenuRootProps> = (props) => {
  return <ContextMenuPrimitive.Root gutter={4} {...props} />;
};

type ContextMenuContentProps = ComponentProps<typeof ContextMenuPrimitive.Content> & {
  class?: string | undefined;
};

const ContextMenuContent: Component<ContextMenuContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        class={cn(
          "z-50 min-w-32 origin-[var(--kb-menu-content-transform-origin)] overflow-hidden rounded-none border bg-popover p-1 text-popover-foreground shadow-sm animate-in",
          local.class,
        )}
        {...others}
      />
    </ContextMenuPrimitive.Portal>
  );
};

type ContextMenuItemProps = ComponentProps<typeof ContextMenuPrimitive.Item> & {
  class?: string | undefined;
};

const ContextMenuItem: Component<ContextMenuItemProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <ContextMenuPrimitive.Item
      class={cn(
        "relative flex cursor-default select-none items-center rounded-none px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        local.class,
      )}
      {...others}
    />
  );
};

const ContextMenuShortcut: Component<ComponentProps<"span">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <span class={cn("ml-auto text-xs tracking-widest opacity-60", local.class)} {...others} />;
};

type ContextMenuSeparatorProps = ComponentProps<typeof ContextMenuPrimitive.Separator> & {
  class?: string | undefined;
};

const ContextMenuSeparator: Component<ContextMenuSeparatorProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <ContextMenuPrimitive.Separator
      class={cn("-mx-1 my-1 h-px bg-muted", local.class)}
      {...others}
    />
  );
};

type ContextMenuSubTriggerProps = ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  class?: string | undefined;
};

const ContextMenuSubTrigger: Component<ContextMenuSubTriggerProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <ContextMenuPrimitive.SubTrigger
      class={cn(
        "flex cursor-default select-none items-center rounded-none px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent",
        local.class,
      )}
      {...others}
    >
      {local["children"]}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="ml-auto size-4"
      >
        <path d="M9 6l6 6l-6 6" />
      </svg>
    </ContextMenuPrimitive.SubTrigger>
  );
};

type ContextMenuSubContentProps = ComponentProps<typeof ContextMenuPrimitive.SubContent> & {
  class?: string | undefined;
};

const ContextMenuSubContent: Component<ContextMenuSubContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <ContextMenuPrimitive.SubContent
      class={cn(
        "z-50 min-w-32 origin-[var(--kb-menu-content-transform-origin)] overflow-hidden rounded-none border bg-popover p-1 text-popover-foreground shadow-sm animate-in",
        local.class,
      )}
      {...others}
    />
  );
};

type ContextMenuCheckboxItemProps = ComponentProps<typeof ContextMenuPrimitive.CheckboxItem> & {
  class?: string | undefined;
};

const ContextMenuCheckboxItem: Component<ContextMenuCheckboxItemProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <ContextMenuPrimitive.CheckboxItem
      class={cn(
        "relative flex cursor-default select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        local.class,
      )}
      {...others}
    >
      <span class="absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
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
            <path d="M5 12l5 5l10 -10" />
          </svg>
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {local["children"]}
    </ContextMenuPrimitive.CheckboxItem>
  );
};

type ContextMenuGroupLabelProps = ComponentProps<typeof ContextMenuPrimitive.GroupLabel> & {
  class?: string | undefined;
};

const ContextMenuGroupLabel: Component<ContextMenuGroupLabelProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <ContextMenuPrimitive.GroupLabel
      class={cn("px-2 py-1.5 text-sm font-semibold", local.class)}
      {...others}
    />
  );
};

type ContextMenuRadioItemProps = ComponentProps<typeof ContextMenuPrimitive.RadioItem> & {
  class?: string | undefined;
};

const ContextMenuRadioItem: Component<ContextMenuRadioItemProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <ContextMenuPrimitive.RadioItem
      class={cn(
        "relative flex cursor-default select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        local.class,
      )}
      {...others}
    >
      <span class="absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="size-2 fill-current"
          >
            <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
          </svg>
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {local["children"]}
    </ContextMenuPrimitive.RadioItem>
  );
};

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuGroupLabel,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
