import { cva } from "@/styled-system/css";

export const uploadPageContainerRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 8,
    minHeight: "100%",
  },
});

export const uploadIntroSectionRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
});

export const uploadTitleRecipe = cva({
  base: {
    fontSize: "2xl",
    fontWeight: "bold",
  },
});

export const uploadDescriptionRecipe = cva({
  base: {
    color: "text.secondary",
    fontSize: "md",
    display: "flex",
    flexWrap: "wrap",
    gap: 1,
  },
});

export const uploadDescriptionCodeRecipe = cva({
  base: {
    backgroundColor: "neutral.900",
    borderRadius: "sm",
    paddingInline: 1,
    fontSize: "sm",
  },
});

export const uploadDropZoneRecipe = cva({
  base: {
    border: "dashed",
    borderRadius: "xl",
    padding: 8,
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    borderColor: "border.default",
    backgroundColor: "transparent",
    opacity: 1,
  },
  variants: {
    dragging: {
      true: {
        borderColor: "primary.400",
        backgroundColor: "dark.surface",
      },
      false: {
        borderColor: "border.default",
        backgroundColor: "transparent",
      },
    },
    loading: {
      true: {
        opacity: 0.7,
      },
      false: {
        opacity: 1,
      },
    },
  },
  defaultVariants: {
    dragging: false,
    loading: false,
  },
});

export const uploadHiddenInputRecipe = cva({
  base: {
    display: "none",
  },
});

export const uploadDropZoneTitleRecipe = cva({
  base: {
    fontSize: "lg",
    fontWeight: "semibold",
    mb: 2,
  },
});

export const uploadDropZoneSubtitleRecipe = cva({
  base: {
    color: "text.secondary",
    fontSize: "sm",
  },
});

export const uploadErrorAlertRecipe = cva({
  base: {
    borderRadius: "md",
    border: "thin",
    borderColor: "error.500",
    backgroundColor: "rgba(220, 38, 38, 0.1)",
    color: "error.100",
    padding: 4,
  },
});

export const uploadResultSectionRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "thin",
    borderColor: "border.default",
    borderRadius: "lg",
    padding: 6,
    backgroundColor: "dark.surface",
  },
});

export const uploadResultHeaderRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
});

export const uploadResultTitleRecipe = cva({
  base: {
    fontSize: "xl",
    fontWeight: "semibold",
  },
});

export const uploadResultMetadataGridRecipe = cva({
  base: {
    display: "grid",
    gridTemplateColumns: {
      base: "repeat(1, minmax(0, 1fr))",
      md: "repeat(2, minmax(0, 1fr))",
    },
    gap: 2,
    color: "text.secondary",
    fontSize: "sm",
  },
});

export const uploadLogViewerRecipe = cva({
  base: {
    maxHeight: "70vh",
    overflow: "auto",
    padding: 4,
    borderRadius: "md",
    backgroundColor: "neutral.900",
    color: "neutral.100",
    fontSize: "sm",
    whiteSpace: "pre-wrap",
    textAlign: "left",
  },
});
