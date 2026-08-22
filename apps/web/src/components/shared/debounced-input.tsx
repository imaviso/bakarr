import { useDebouncedCallback } from "@tanstack/react-pacer";
import { useState } from "react";
import { Input } from "~/components/ui/input";

interface DebouncedInputProps {
  id?: string;
  placeholder?: string;
  type?: "number" | "text" | "date" | "datetime-local";
  value: string;
  wait?: number;
  onCommit: (value: string) => void;
  className?: string;
}

const DEFAULT_WAIT_MS = 400;

/** Controlled input that keeps typing responsive locally and commits changes debounced. */
export function DebouncedInput(props: DebouncedInputProps) {
  const [localValue, setLocalValue] = useState<string | null>(null);
  const commit = useDebouncedCallback(
    (value: string) => {
      setLocalValue(null);
      props.onCommit(value);
    },
    { wait: props.wait ?? DEFAULT_WAIT_MS },
  );

  // If parent value changes externally while user is typing, keep local
  // divergence until commit; once not typing (localValue null) reflect parent.
  // No extra sync needed — `value={localValue ?? props.value}` covers it.

  return (
    <Input
      {...(props.id === undefined ? {} : { id: props.id })}
      {...(props.type === undefined ? {} : { type: props.type })}
      {...(props.placeholder === undefined ? {} : { placeholder: props.placeholder })}
      {...(props.className === undefined ? {} : { className: props.className })}
      value={localValue ?? props.value}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setLocalValue(next);
        commit(next);
      }}
    />
  );
}
