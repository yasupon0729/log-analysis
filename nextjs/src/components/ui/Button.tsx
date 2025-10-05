"use client";

import type { ComponentPropsWithoutRef } from "react";
import { forwardRef } from "react";

import { cx } from "@/styled-system/css";
import type { RecipeVariantProps } from "@/styled-system/types";
import { buttonRecipe } from "@/styles/recipes/components/button.recipe";

type ButtonVariantProps = RecipeVariantProps<typeof buttonRecipe>;

export type ButtonProps = ButtonVariantProps &
  ComponentPropsWithoutRef<"button"> & {
    /**
     * ローディング状態を示し、`disabled` を強制します。
     */
    isLoading?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      rounded,
      isLoading = false,
      disabled,
      type,
      children,
      ...rest
    },
    ref,
  ) => {
    const resolvedType = type ?? "button";
    const resolvedDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={resolvedType}
        className={cx(
          buttonRecipe({ variant, size, fullWidth, rounded }),
          className,
        )}
        disabled={resolvedDisabled}
        aria-busy={isLoading || undefined}
        data-loading={isLoading ? "true" : undefined}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
