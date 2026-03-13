export function createDebouncer<T>(
  callback: (value: T) => void,
  delayMs: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return {
    cancel() {
      if (timeout !== undefined) {
        clearTimeout(timeout);
        timeout = undefined;
      }
    },
    schedule(value: T) {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        timeout = undefined;
        callback(value);
      }, delayMs);
    },
  };
}
