import { cva } from "@/styled-system/css";

export const buttonRecipe = cva({
  base: {
    appearance: "none",
    border: "none",
    borderRadius: "md",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    fontWeight: "medium",
    lineHeight: "normal",
    transition: "all 0.2s ease-in-out",
    textDecoration: "none",
    whiteSpace: "nowrap",
    _focusVisible: {
      outline: "2px solid",
      outlineColor: "primary.500",
      outlineOffset: "2px",
    },
    _disabled: {
      cursor: "not-allowed",
      opacity: 0.6,
      boxShadow: "none",
    },
  },
  variants: {
    variant: {
      solid: {
        backgroundColor: "primary.600",
        color: "white",
        boxShadow: "0 4px 12px rgba(9, 103, 210, 0.25)",
        _hover: {
          backgroundColor: "primary.500",
        },
        _active: {
          backgroundColor: "primary.700",
        },
      },
      subtle: {
        backgroundColor: "dark.surface",
        color: "text.primary",
        border: "thin",
        borderColor: "dark.border",
        _hover: {
          backgroundColor: "dark.surfaceHover",
        },
        _active: {
          backgroundColor: "dark.surfaceActive",
        },
      },
      outline: {
        backgroundColor: "transparent",
        border: "thin",
        borderColor: "border.default",
        color: "text.primary",
        _hover: {
          backgroundColor: "rgba(9, 103, 210, 0.08)",
          borderColor: "primary.500",
          color: "primary.200",
        },
        _active: {
          backgroundColor: "rgba(9, 103, 210, 0.12)",
          borderColor: "primary.400",
        },
      },
      ghost: {
        backgroundColor: "transparent",
        color: "text.secondary",
        _hover: {
          backgroundColor: "dark.surfaceHover",
          color: "text.primary",
        },
        _active: {
          backgroundColor: "dark.surfaceActive",
        },
      },
      destructive: {
        backgroundColor: "status.error",
        color: "white",
        _hover: {
          backgroundColor: "#b91c1c",
        },
        _active: {
          backgroundColor: "#991b1b",
        },
      },
      link: {
        backgroundColor: "transparent",
        color: "primary.300",
        paddingInline: 0,
        height: "auto",
        textDecoration: "underline",
        _hover: {
          color: "primary.200",
        },
        _active: {
          color: "primary.400",
        },
      },
      unstyled: {
        backgroundColor: "transparent",
        borderRadius: "inherit",
        paddingInline: 0,
        paddingBlock: 0,
        boxShadow: "none",
        color: "inherit",
        textAlign: "inherit",
      },
    },
    size: {
      sm: {
        fontSize: "sm",
        paddingInline: 3,
        paddingBlock: 1,
        minHeight: "32px",
      },
      md: {
        fontSize: "md",
        paddingInline: 4,
        paddingBlock: 2,
        minHeight: "40px",
      },
      lg: {
        fontSize: "lg",
        paddingInline: 5,
        paddingBlock: 3,
        minHeight: "48px",
      },
    },
    fullWidth: {
      true: {
        width: "100%",
      },
    },
    rounded: {
      true: {
        borderRadius: "full",
      },
    },
  },
  compoundVariants: [
    {
      variant: "solid",
      rounded: true,
      css: {
        paddingInline: 6,
      },
    },
  ],
  defaultVariants: {
    variant: "solid",
    size: "md",
  },
});
