"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiLoader4Line,
} from "@remixicon/react";
import { useTheme } from "@/components/shared/theme-provider";

function toSonnerTheme(theme: string | undefined): "light" | "dark" | "system" {
  return theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
}

type CSSVarStyle = React.CSSProperties & Record<`--${string}`, string>;

const toasterStyle: CSSVarStyle = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--border-radius": "var(--radius)",
};

const Toaster = ({ toastOptions, theme: _theme, ...props }: ToasterProps) => {
  const { theme } = useTheme();

  return (
    <Sonner
      {...props}
      theme={toSonnerTheme(theme)}
      className="toaster group"
      icons={{
        success: <RiCheckboxCircleLine className="size-4" />,
        info: <RiInformationLine className="size-4" />,
        warning: <RiErrorWarningLine className="size-4" />,
        error: <RiCloseCircleLine className="size-4" />,
        loading: <RiLoader4Line className="size-4 animate-spin" />,
      }}
      style={toasterStyle}
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
        ...toastOptions,
      }}
    />
  );
};

export { Toaster };
