interface FieldErrorProps {
  error?: string;
}

export function FieldError(props: FieldErrorProps) {
  if (!props.error) return null;
  return <div className="text-xs text-destructive">{props.error}</div>;
}
