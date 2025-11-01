import { cva } from "@/styled-system/css";

export const cardListContainerRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
});

export const cardListHeaderRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 3,
  },
});

export const cardListActionsRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
});

export const cardListBodyRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    maxHeight: "70vh",
    overflowY: "auto",
    paddingRight: 2,
  },
});

export const cardListItemRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    borderRadius: "lg",
    border: "thin",
    borderColor: "border.default",
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    padding: 4,
    transition: "background 0.2s ease",
    cursor: "pointer",
    _hover: {
      backgroundColor: "rgba(30, 41, 59, 0.7)",
    },
  },
  variants: {
    selected: {
      true: {
        borderColor: "accent.default",
        boxShadow: "0 0 0 1px rgba(56, 189, 248, 0.4)",
        backgroundColor: "rgba(30, 64, 175, 0.35)",
      },
    },
  },
});
