import { cva } from "@/styled-system/css";

export const sidebarRecipe = cva({
  base: {
    position: "fixed",
    left: 0,
    top: 0,
    height: "100vh",
    bg: "dark.surface",
    borderRight: "thin",
    borderColor: "dark.border",
    display: "flex",
    flexDirection: "column",
    transition: "width 0.3s ease-in-out",
    zIndex: "overlay",
  },
  variants: {
    expanded: {
      true: {
        width: "240px",
      },
      false: {
        width: "80px",
      },
    },
  },
  defaultVariants: {
    expanded: false,
  },
});

export const sidebarHeaderRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "80px",
    borderBottom: "thin",
    borderColor: "dark.border",
    px: 4,
  },
});

export const sidebarNavRecipe = cva({
  base: {
    flex: 1,
    py: 4,
    overflowY: "auto",
    overflowX: "hidden",
  },
});

export const sidebarNavItemRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    py: 3,
    px: 4,
    mb: 2,
    mx: 2,
    borderRadius: "lg",
    cursor: "pointer",
    transition: "all 0.2s ease-in-out",
    color: "text.secondary",
    fontSize: "sm",
    fontWeight: "medium",
    textAlign: "center",
    gap: 2,
    width: "calc(100% - 16px)",
    background: "transparent",
    border: "none",
    _hover: {
      bg: "dark.surfaceHover",
      color: "text.primary",
    },
  },
  variants: {
    active: {
      true: {
        bg: "primary.900",
        color: "primary.300",
        _hover: {
          bg: "primary.800",
          color: "primary.200",
        },
      },
    },
    expanded: {
      true: {
        flexDirection: "row",
        justifyContent: "flex-start",
      },
      false: {
        flexDirection: "column",
      },
    },
  },
  defaultVariants: {
    active: false,
    expanded: false,
  },
});

export const sidebarIconRecipe = cva({
  base: {
    width: "24px",
    height: "24px",
    flexShrink: 0,
  },
});

export const sidebarLabelRecipe = cva({
  base: {
    transition: "opacity 0.2s ease-in-out",
    whiteSpace: "nowrap",
  },
  variants: {
    expanded: {
      true: {
        opacity: 1,
        display: "block",
      },
      false: {
        opacity: 0,
        display: "none",
        width: 0,
      },
    },
  },
  defaultVariants: {
    expanded: false,
  },
});

export const sidebarTooltipRecipe = cva({
  base: {
    position: "fixed",
    left: "calc(var(--sidebar-width, 80px) + 12px)",
    backgroundColor: "neutral.900",
    color: "neutral.100",
    borderRadius: "md",
    paddingInline: 3,
    paddingBlock: 2,
    fontSize: "sm",
    whiteSpace: "nowrap",
    boxShadow: "lg",
    opacity: 0,
    pointerEvents: "none",
    transition: "opacity 0.15s ease-in-out, transform 0.15s ease-in-out",
    zIndex: "dialog",
  },
  variants: {
    visible: {
      true: {
        opacity: 1,
        transform: "translateY(-50%)",
      },
      false: {
        opacity: 0,
        transform: "translateY(-40%)",
      },
    },
  },
  defaultVariants: {
    visible: false,
  },
});

export const sidebarToggleRecipe = cva({
  base: {
    position: "absolute",
    right: "-12px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "24px",
    height: "48px",
    bg: "primary.600",
    borderRadius: "0 md md 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "white",
    transition: "all 0.2s ease-in-out",
    _hover: {
      bg: "primary.500",
      width: "28px",
    },
  },
});

// Header内のロゴコンテナ
export const sidebarLogoContainerRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: 3,
  },
});

// ロゴアイコン
export const sidebarLogoIconRecipe = cva({
  base: {
    fontSize: "2xl",
    color: "primary.400",
  },
});

// ロゴテキスト（基本スタイル）
export const sidebarLogoTextRecipe = cva({
  base: {
    fontSize: "lg",
    fontWeight: "bold",
    color: "text.primary",
  },
});

// Footer全体
export const sidebarFooterRecipe = cva({
  base: {
    borderTop: "thin",
    borderColor: "dark.border",
    p: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
});

// ユーザーアバター
export const sidebarUserAvatarRecipe = cva({
  base: {
    width: "32px",
    height: "32px",
    borderRadius: "full",
    bg: "tertiary.600",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontSize: "sm",
    fontWeight: "bold",
  },
});

// ユーザー情報コンテナ
export const sidebarUserInfoRecipe = cva({
  base: {
    flex: 1,
  },
});

// ユーザー名
export const sidebarUserNameRecipe = cva({
  base: {
    fontSize: "sm",
    color: "text.primary",
    fontWeight: "medium",
  },
});

// ユーザー役割
export const sidebarUserRoleRecipe = cva({
  base: {
    fontSize: "xs",
    color: "text.tertiary",
  },
});

// トグルボタン内のアイコン
export const sidebarToggleIconRecipe = cva({
  base: {
    transition: "transform 0.2s ease-in-out",
  },
  variants: {
    expanded: {
      true: {
        transform: "rotate(180deg)",
      },
      false: {
        transform: "rotate(0deg)",
      },
    },
  },
  defaultVariants: {
    expanded: false,
  },
});
