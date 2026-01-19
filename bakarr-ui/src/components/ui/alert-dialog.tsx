import type { JSX, ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import * as AlertDialogPrimitive from "@kobalte/core/alert-dialog"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"

import { cn } from "~/lib/utils"

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal

type AlertDialogOverlayProps<T extends ValidComponent = "div"> =
  AlertDialogPrimitive.AlertDialogOverlayProps<T> & {
    class?: string | undefined
  }

const AlertDialogOverlay = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, AlertDialogOverlayProps<T>>
) => {
  const [local, others] = splitProps(props as AlertDialogOverlayProps, ["class"])
  return (
    <AlertDialogPrimitive.Overlay
      class={cn(
        "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0",
        local.class
      )}
      {...others}
    />
  )
}

type AlertDialogContentProps<T extends ValidComponent = "div"> =
  AlertDialogPrimitive.AlertDialogContentProps<T> & {
    class?: string | undefined
    children?: JSX.Element
  }

const AlertDialogContent = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, AlertDialogContentProps<T>>
) => {
  const [local, others] = splitProps(props as AlertDialogContentProps, ["class", "children"])
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        class={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[expanded]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:fade-in-0 data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95 data-[closed]:slide-out-to-left-1/2 data-[closed]:slide-out-to-top-[48%] data-[expanded]:slide-in-from-left-1/2 data-[expanded]:slide-in-from-top-[48%] sm:rounded-lg md:w-full",
          local.class
        )}
        {...others}
      >
        {local.children}
        <AlertDialogPrimitive.CloseButton class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[expanded]:bg-accent data-[expanded]:text-muted-foreground">
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
  )
}

type AlertDialogTitleProps<T extends ValidComponent = "h2"> =
  AlertDialogPrimitive.AlertDialogTitleProps<T> & {
    class?: string | undefined
  }

const AlertDialogTitle = <T extends ValidComponent = "h2">(
  props: PolymorphicProps<T, AlertDialogTitleProps<T>>
) => {
  const [local, others] = splitProps(props as AlertDialogTitleProps, ["class"])
  return <AlertDialogPrimitive.Title class={cn("text-lg font-semibold", local.class)} {...others} />
}

type AlertDialogDescriptionProps<T extends ValidComponent = "p"> =
  AlertDialogPrimitive.AlertDialogDescriptionProps<T> & {
    class?: string | undefined
  }

const AlertDialogDescription = <T extends ValidComponent = "p">(
  props: PolymorphicProps<T, AlertDialogDescriptionProps<T>>
) => {
  const [local, others] = splitProps(props as AlertDialogDescriptionProps, ["class"])
  return (
    <AlertDialogPrimitive.Description
      class={cn("text-sm text-muted-foreground", local.class)}
      {...others}
    />
  )
}

const AlertDialogHeader = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, JSX.HTMLAttributes<HTMLDivElement>>
) => {
  const [local, others] = splitProps(props as JSX.HTMLAttributes<HTMLDivElement>, ["class"])
  return (
    <div
      class={cn("flex flex-col space-y-2 text-center sm:text-left", local.class)}
      {...others}
    />
  )
}

const AlertDialogFooter = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, JSX.HTMLAttributes<HTMLDivElement>>
) => {
  const [local, others] = splitProps(props as JSX.HTMLAttributes<HTMLDivElement>, ["class"])
  return (
    <div
      class={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        local.class
      )}
      {...others}
    />
  )
}

// Action and Cancel are slightly different in Kobalte/Primitives compared to Radix
// But we can use standard Buttons that close the dialog?
// Actually Kobalte doesn't have explicit Action/Cancel primitive parts other than CloseButton.
// So we usually wrap Button.

import { Button } from "~/components/ui/button"

const AlertDialogAction = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, any>
) => {
  const [local, others] = splitProps(props as any, ["class"])
  // For now, we assume this is acting as a submit or confirmation.
  // Ideally it should be a CloseButton if it closes the dialog, but often it triggers async action then closes.
  // If it triggers async, the user handles closing manually or via state.
  // However, in standard shadcn, Action closes the dialog?
  // In Kobalte, we can use AlertDialogPrimitive.CloseButton if we want it to close.
  // But usually Action implies "Do the thing".
  return (
    <AlertDialogPrimitive.CloseButton
      as={Button}
      class={cn(local.class)}
      {...others}
    />
  )
}

const AlertDialogCancel = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, any>
) => {
  const [local, others] = splitProps(props as any, ["class"])
  return (
    <AlertDialogPrimitive.CloseButton
      as={Button}
      variant="outline"
      class={cn("mt-2 sm:mt-0", local.class)}
      {...others}
    />
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel
}
