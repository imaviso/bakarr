"use client";

import type * as React from "react";
import {
  Button as ButtonPrimitive,
  Link as LinkPrimitive,
  type ButtonProps as ButtonPrimitiveProps,
  type LinkProps as LinkPrimitiveProps,
} from "react-aria-components";

import { cn } from "@/infra/utils";
import { buttonVariants, type ButtonVariants } from "@/components/ui/button-variants";

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: Omit<ButtonPrimitiveProps, "className"> &
  React.RefAttributes<HTMLButtonElement> &
  ButtonVariants & {
    className?: string;
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

function LinkButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: LinkPrimitiveProps & ButtonVariants & { className?: string }) {
  return (
    <LinkPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, LinkButton };
