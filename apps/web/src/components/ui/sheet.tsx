import type { Component, ComponentProps, JSX } from "solid-js";
import { splitProps } from "solid-js";

import * as SheetPrimitive from "@kobalte/core/dialog";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "~/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.CloseButton;

const portalVariants = cva("fixed inset-0 z-50 flex", {
  variants: {
    position: {
      top: "items-start",
      bottom: "items-end",
      left: "justify-start",
      right: "justify-end",
    },
  },
  defaultVariants: { position: "right" },
});

type PortalProps = SheetPrimitive.DialogPortalProps & VariantProps<typeof portalVariants>;

const SheetPortal: Component<PortalProps> = (props) => {
  const [local, others] = splitProps(props, ["position", "children"]);
  return (
    <SheetPrimitive.Portal {...others}>
      <div class={portalVariants({ position: local.position })}>{local.children}</div>
    </SheetPrimitive.Portal>
  );
};

type DialogOverlayProps = ComponentProps<typeof SheetPrimitive.Overlay> & {
  class?: string | undefined;
};

const SheetOverlay: Component<DialogOverlayProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SheetPrimitive.Overlay
      class={cn(
        "fixed inset-0 z-50 bg-black/80 data-[expanded=]:animate-in data-[closed=]:animate-out data-[closed=]:fade-out-0 data-[expanded=]:fade-in-0",
        local.class,
      )}
      {...others}
    />
  );
};

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-background p-6 shadow-sm border-border transition ease-in-out data-[closed=]:duration-300 data-[expanded=]:duration-500 data-[expanded=]:animate-in data-[closed=]:animate-out",
  {
    variants: {
      position: {
        top: "inset-x-0 top-0 border-b data-[closed=]:slide-out-to-top data-[expanded=]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[closed=]:slide-out-to-bottom data-[expanded=]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[closed=]:slide-out-to-left data-[expanded=]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l data-[closed=]:slide-out-to-right data-[expanded=]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      position: "right",
    },
  },
);

type DialogContentProps = ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants> & { class?: string | undefined; children?: JSX.Element };

const SheetContent: Component<DialogContentProps> = (props) => {
  const [local, others] = splitProps(props, ["position", "class", "children"]);
  return (
    <SheetPortal position={local.position}>
      <SheetOverlay />
      <SheetPrimitive.Content
        class={cn(
          sheetVariants({ position: local.position }),
          local.class,
          "max-h-screen overflow-y-auto",
        )}
        {...others}
      >
        {local.children}
        <SheetPrimitive.CloseButton class="absolute right-4 top-4 rounded-none opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
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
            <path d="M18 6l-12 12" />
            <path d="M6 6l12 12" />
          </svg>
          <span class="sr-only">Close</span>
        </SheetPrimitive.CloseButton>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
};

const SheetHeader: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div class={cn("flex flex-col space-y-2 text-center sm:text-left", local.class)} {...others} />
  );
};

const SheetFooter: Component<ComponentProps<"div">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", local.class)}
      {...others}
    />
  );
};

type DialogTitleProps = ComponentProps<typeof SheetPrimitive.Title> & {
  class?: string | undefined;
};

const SheetTitle: Component<DialogTitleProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SheetPrimitive.Title
      class={cn("text-lg font-semibold text-foreground", local.class)}
      {...others}
    />
  );
};

type DialogDescriptionProps = ComponentProps<typeof SheetPrimitive.Description> & {
  class?: string | undefined;
};

const SheetDescription: Component<DialogDescriptionProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <SheetPrimitive.Description
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  );
};

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
