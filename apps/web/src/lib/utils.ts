import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function copyToClipboard(text: string): Promise<boolean> {
  let success = false;

  // Try Modern API first
  if (navigator.clipboard && globalThis.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      success = true;
    } catch {}
  }

  // Fallback if modern API failed or not available
  if (!success) {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;

      // Ensure it's not visible but part of DOM so it can be focused/selected
      // placing it in center of viewport is more reliable than off-screen
      textArea.style.position = "fixed";
      textArea.style.left = "50%";
      textArea.style.top = "50%";
      textArea.style.transform = "translate(-50%, -50%)";
      textArea.style.opacity = "0";
      textArea.style.pointerEvents = "none";
      textArea.setAttribute("readonly", "");

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, 99999); // For mobile devices

      const result = document.execCommand("copy");
      document.body.removeChild(textArea);

      if (result) success = true;
    } catch {}
  }

  return success;
}
