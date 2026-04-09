export function handleFiniteNumberInput(
  event: InputEvent & { currentTarget: HTMLInputElement; target: Element },
  onChange: (value: number) => void,
) {
  const nextValue = event.currentTarget.valueAsNumber;
  if (Number.isFinite(nextValue)) {
    onChange(nextValue);
  }
}
