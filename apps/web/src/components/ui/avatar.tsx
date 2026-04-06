import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import * as ImagePrimitive from "@kobalte/core/image";

import { cn } from "~/lib/utils";

type AvatarRootProps = ComponentProps<typeof ImagePrimitive.Root> & {
  class?: string | undefined;
};

const Avatar: Component<AvatarRootProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <ImagePrimitive.Root
      class={cn("relative flex size-10 shrink-0 overflow-hidden rounded-full", local.class)}
      {...others}
    />
  );
};

type AvatarImageProps = ComponentProps<typeof ImagePrimitive.Img> & {
  class?: string | undefined;
};

const AvatarImage: Component<AvatarImageProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <ImagePrimitive.Img class={cn("aspect-square size-full", local.class)} {...others} />;
};

type AvatarFallbackProps = ComponentProps<typeof ImagePrimitive.Fallback> & {
  class?: string | undefined;
};

const AvatarFallback: Component<AvatarFallbackProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <ImagePrimitive.Fallback
      class={cn("flex size-full items-center justify-center bg-muted", local.class)}
      {...others}
    />
  );
};

export { Avatar, AvatarFallback, AvatarImage };
