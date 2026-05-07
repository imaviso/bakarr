"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "~/components/shared/theme-provider";
import {
  CheckCircleIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";

type CSSVariables = React.CSSProperties & Record<`--${string}`, string | number | undefined>;

const toasterStyle: CSSVariables = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "0px",
};

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  const toasterTheme: ToasterProps["theme"] =
    theme === "dark" || theme === "light" ? theme : "system";

  return (
    <Sonner
      theme={toasterTheme}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <WarningIcon className="size-4" />,
        error: <XCircleIcon className="size-4" />,
        loading: <SpinnerIcon className="size-4 animate-spin" />,
      }}
      style={toasterStyle}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
