"use client";

import type { ReactNode } from "react";
import { cva, cx } from "@/styled-system/css";

interface AlertBannerProps {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  description?: ReactNode;
  className?: string;
  onDismiss?: () => void;
}

const alertBannerRecipe = cva({
  base: {
    display: "flex",
    alignItems: "flex-start",
    gap: 3,
    borderRadius: "md",
    border: "thin",
    padding: 4,
    fontSize: "sm",
  },
  variants: {
    variant: {
      info: {
        backgroundColor: "dark.surface",
        borderColor: "border.default",
        color: "text.secondary",
      },
      success: {
        backgroundColor: "rgba(34, 197, 94, 0.12)",
        borderColor: "green.500",
        color: "green.200",
      },
      warning: {
        backgroundColor: "rgba(234, 179, 8, 0.12)",
        borderColor: "yellow.500",
        color: "yellow.200",
      },
      error: {
        backgroundColor: "rgba(239, 68, 68, 0.12)",
        borderColor: "red.500",
        color: "red.200",
      },
    },
  },
  defaultVariants: {
    variant: "info",
  },
});

const titleClass = cva({
  base: {
    fontWeight: "semibold",
    lineHeight: "short",
    marginBottom: 1,
  },
});

const descriptionClass = cva({
  base: {
    lineHeight: "tall",
  },
});

const dismissButtonClass = cva({
  base: {
    marginLeft: "auto",
    background: "transparent",
    border: "none",
    color: "inherit",
    cursor: "pointer",
    fontSize: "lg",
    lineHeight: "1",
    padding: 0,
  },
});

export function AlertBanner({
  variant = "info",
  title,
  description,
  className,
  onDismiss,
}: AlertBannerProps) {
  return (
    <div className={cx(alertBannerRecipe({ variant }), className)} role="alert">
      <div>
        {title ? <p className={titleClass()}>{title}</p> : null}
        {description ? (
          <div className={descriptionClass()}>{description}</div>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className={dismissButtonClass()}
          onClick={onDismiss}
          aria-label="通知を閉じる"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
