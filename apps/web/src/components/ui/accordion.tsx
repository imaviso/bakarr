import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import * as AccordionPrimitive from "@kobalte/core/accordion";

import { cn } from "~/lib/utils";

const Accordion = AccordionPrimitive.Root;

type AccordionItemProps = ComponentProps<typeof AccordionPrimitive.Item> & {
  class?: string | undefined;
};

const AccordionItem: Component<AccordionItemProps> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <AccordionPrimitive.Item class={cn("border-b", local.class)} {...others} />;
};

type AccordionTriggerProps = ComponentProps<typeof AccordionPrimitive.Trigger> & {
  class?: string | undefined;
};

const AccordionTrigger: Component<AccordionTriggerProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <AccordionPrimitive.Header class="flex">
      <AccordionPrimitive.Trigger
        class={cn(
          "flex flex-1 items-center justify-between py-4 font-medium transition-colors hover:underline [&[data-expanded]>svg]:rotate-180",
          local.class,
        )}
        {...others}
      >
        {local.children}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="size-4 shrink-0 transition-transform duration-200"
        >
          <path d="M6 9l6 6l6 -6" />
        </svg>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
};

type AccordionContentProps = ComponentProps<typeof AccordionPrimitive.Content> & {
  class?: string | undefined;
};

const AccordionContent: Component<AccordionContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);
  return (
    <AccordionPrimitive.Content
      class={cn(
        "animate-accordion-up overflow-hidden text-sm data-[expanded]:animate-accordion-down",
        local.class,
      )}
      {...others}
    >
      <div class="pb-4 pt-0">{local.children}</div>
    </AccordionPrimitive.Content>
  );
};

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
