export function pathBasename(value: string): string {
  return value.split(/[\\/]/).at(-1) ?? value;
}

export function pathExtension(value: string, fallback: string): string {
  const fileName = pathBasename(value);
  return fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : fallback;
}

export function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}
