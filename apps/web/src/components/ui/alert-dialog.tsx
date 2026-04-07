import type { Component, ComponentProps, JSX } from "solid-js";
import { splitProps } from "solid-js";

import * as AlertDialogPrimitive from "@kobalte/core/alert-dialog";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

type AlertDialogOverlayProps = ComponentProps<typeof AlertDialogPrimitive.Overlay> & {
  class?: string | undefined;
};

const AlertDialogOverlay: Component<AlertDialogOverlayProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <AlertDialogPrimitive.Overlay
      class={cn(
        "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0",
        local.class,
      )}
      {...others}
    />
  );
};

type AlertDialogContentProps = ComponentProps<typeof AlertDialogPrimitive.Content> & {
  class?: string | undefined;
  children?: JSX.Element;
};

const AlertDialogContent: Component<AlertDialogContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        class={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-background p-6 shadow-sm duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%] sm:rounded-none md:w-full",
          local.class,
        )}
        {...others}
      >
        {local.children}
        <AlertDialogPrimitive.CloseButton class="absolute right-4 top-4 rounded-none opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[expanded]:bg-accent data-[expanded]:text-muted-foreground">
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
        </AlertDialogPrimitive.CloseButton>
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  );
};

type AlertDialogTitleProps = ComponentProps<typeof AlertDialogPrimitive.Title> & {
  class?: string | undefined;
};

const AlertDialogTitle: Component<AlertDialogTitleProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <AlertDialogPrimitive.Title class={cn("text-lg font-semibold", local.class)} {...others} />
  );
};

type AlertDialogDescriptionProps = ComponentProps<typeof AlertDialogPrimitive.Description> & {
  class?: string | undefined;
};

const AlertDialogDescription: Component<AlertDialogDescriptionProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <AlertDialogPrimitive.Description
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  );
};

const AlertDialogHeader: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div class={cn("flex flex-col space-y-2 text-center sm:text-left", local.class)} {...others} />
  );
};

const AlertDialogFooter: Component<JSX.HTMLAttributes<HTMLDivElement>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <div
      class={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", local.class)}
      {...others}
    />
  );
};

type AlertDialogButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  class?: string | undefined;
};

const AlertDialogAction = (props: AlertDialogButtonProps) => {
  return <Button {...props} class={cn(props.class)} />;
};

const AlertDialogCancel = (props: AlertDialogButtonProps) => {
  return <Button {...props} variant="outline" class={cn("mt-2 sm:mt-0", props.class)} />;
};

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
