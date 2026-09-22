interface FieldErrorProps {
  error?: string | undefined;
  id?: string;
}

export function FieldError(props: FieldErrorProps) {
  if (!props.error) return null;
  return (
    <div id={props.id} role="alert" aria-live="polite" className="text-xs text-destructive">
      {props.error}
    </div>
  );
}
