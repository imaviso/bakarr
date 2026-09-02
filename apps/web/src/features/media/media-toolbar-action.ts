import type { ReactNode } from "react";

export interface MediaToolbarAction {
  key: string;
  icon: ReactNode;
  /** Shown as tooltip; also the aria-label. */
  tooltip: string;
  /** Text label hidden on small screens. */
  label?: string;
  onPress: () => void;
  /** Disables the button and shows the spinner on the icon. */
  pending?: boolean;
  /** Disables the button without the spinner. */
  disabled?: boolean;
  /** Button style override (e.g. "default" for the active monitor toggle). */
  variant?: "default" | "outline";
}
