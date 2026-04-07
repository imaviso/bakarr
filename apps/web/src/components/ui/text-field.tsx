import type { Component, ComponentProps } from "solid-js";
import { mergeProps, splitProps } from "solid-js";

import * as TextFieldPrimitive from "@kobalte/core/text-field";
import { cva } from "class-variance-authority";

import { cn } from "~/lib/utils";

type TextFieldRootProps = ComponentProps<typeof TextFieldPrimitive.Root> & {
  class?: string | undefined;
};

const TextField: Component<TextFieldRootProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <TextFieldPrimitive.Root class={cn("flex flex-col gap-1", local.class)} {...others} />;
};

type TextFieldInputProps = ComponentProps<typeof TextFieldPrimitive.Input> & {
  class?: string | undefined;
  type?:
    | "button"
    | "checkbox"
    | "color"
    | "date"
    | "datetime-local"
    | "email"
    | "file"
    | "hidden"
    | "image"
    | "month"
    | "number"
    | "password"
    | "radio"
    | "range"
    | "reset"
    | "search"
    | "submit"
    | "tel"
    | "text"
    | "time"
    | "url"
    | "week";
};

const TextFieldInput: Component<TextFieldInputProps> = (rawProps) => {
  const props = mergeProps<TextFieldInputProps[]>({ type: "text" }, rawProps);
  const [local, others] = splitProps(props, ["type", "class"]);
  return (
    <TextFieldPrimitive.Input
      type={local.type}
      class={cn(
        "h-10 w-full rounded-none border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-error-foreground data-[invalid]:text-error-foreground",
        local.class,
      )}
      {...others}
    />
  );
};

type TextFieldTextAreaProps = ComponentProps<typeof TextFieldPrimitive.TextArea> & {
  class?: string | undefined;
};

const TextFieldTextArea: Component<TextFieldTextAreaProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <TextFieldPrimitive.TextArea
      class={cn(
        "flex min-h-[80px] w-full rounded-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        local.class,
      )}
      {...others}
    />
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

type TextFieldLabelProps = ComponentProps<typeof TextFieldPrimitive.Label> & {
  class?: string | undefined;
};

const TextFieldLabel: Component<TextFieldLabelProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <TextFieldPrimitive.Label class={cn(labelVariants(), local.class)} {...others} />;
};

type TextFieldDescriptionProps = ComponentProps<typeof TextFieldPrimitive.Description> & {
  class?: string | undefined;
};

const TextFieldDescription: Component<TextFieldDescriptionProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <TextFieldPrimitive.Description
      class={cn(labelVariants({ variant: "description" }), local.class)}
      {...others}
    />
  );
};

type TextFieldErrorMessageProps = ComponentProps<typeof TextFieldPrimitive.ErrorMessage> & {
  class?: string | undefined;
};

const TextFieldErrorMessage: Component<TextFieldErrorMessageProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <TextFieldPrimitive.ErrorMessage
      class={cn(labelVariants({ variant: "error" }), local.class)}
      {...others}
    />
  );
};

export {
  TextField,
  TextFieldDescription,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
  TextFieldTextArea,
};
