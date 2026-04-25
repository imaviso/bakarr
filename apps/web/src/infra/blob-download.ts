export function triggerBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = fileName;

  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(objectUrl);
}
