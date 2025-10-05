import { cva } from "@/styled-system/css";

export const dataTableContainerRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    borderRadius: "xl",
    border: "thin",
    borderColor: "border.default",
    backgroundColor: "dark.surface",
    boxShadow: "md",
  },
});

export const dataTableWrapperRecipe = cva({
  base: {
    overflowX: "auto",
  },
});

export const dataTableRecipe = cva({
  base: {
    width: "100%",
    minWidth: "640px",
    borderCollapse: "separate",
    borderSpacing: 0,
  },
});

export const dataTableHeadRecipe = cva({
  base: {
    backgroundColor: "dark.surfaceHover",
  },
});

export const dataTableHeaderCellRecipe = cva({
  base: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    paddingX: 4,
    paddingY: 3,
    textAlign: "left",
    fontSize: "xs",
    fontWeight: "semibold",
    letterSpacing: "widest",
    textTransform: "uppercase",
    color: "text.secondary",
    backgroundColor: "dark.surfaceHover",
    borderBottom: "thin",
    borderRight: "thin",
    borderColor: "border.default",
    transition: "background-color 0.2s, color 0.2s",
    _last: {
      borderRight: "none",
    },
  },
  variants: {
    sortable: {
      true: {
        cursor: "pointer",
        _hover: {
          color: "text.primary",
          backgroundColor: "dark.surfaceActive",
        },
      },
      false: {
        cursor: "default",
      },
    },
    direction: {
      none: {},
      asc: {
        color: "text.primary",
        backgroundColor: "dark.surfaceActive",
      },
      desc: {
        color: "text.primary",
        backgroundColor: "dark.surfaceActive",
      },
    },
  },
  compoundVariants: [
    {
      sortable: true,
      direction: "asc",
      css: {
        borderColor: "primary.500",
      },
    },
    {
      sortable: true,
      direction: "desc",
      css: {
        borderColor: "primary.500",
      },
    },
  ],
  defaultVariants: {
    sortable: false,
    direction: "none",
  },
});

export const dataTableFilterRowRecipe = cva({
  base: {
    backgroundColor: "dark.surface",
    borderBottom: "thin",
    borderColor: "border.default",
  },
});

export const dataTableFilterCellRecipe = cva({
  base: {
    paddingX: 4,
    paddingY: 3,
    borderRight: "thin",
    borderColor: "border.subtle",
    _last: {
      borderRight: "none",
    },
  },
});

export const dataTableFilterInputRecipe = cva({
  base: {
    width: "full",
    paddingX: 3,
    paddingY: 2,
    fontSize: "sm",
    borderRadius: "md",
    border: "thin",
    borderColor: "border.default",
    backgroundColor: "dark.surfaceActive",
    color: "text.primary",
    transition: "border-color 0.2s, box-shadow 0.2s",
    _placeholder: {
      color: "text.secondary",
    },
    _focus: {
      outline: "none",
      borderColor: "primary.500",
      boxShadow: "0 0 0 2px rgba(33, 134, 235, 0.35)",
    },
  },
});

export const dataTableFilterSelectRecipe = cva({
  base: {
    width: "full",
    paddingX: 3,
    paddingY: 2,
    fontSize: "sm",
    borderRadius: "md",
    border: "thin",
    borderColor: "border.default",
    backgroundColor: "dark.surfaceActive",
    color: "text.primary",
    cursor: "pointer",
    transition: "border-color 0.2s, box-shadow 0.2s",
    _focus: {
      outline: "none",
      borderColor: "primary.500",
      boxShadow: "0 0 0 2px rgba(33, 134, 235, 0.35)",
    },
  },
});

export const dataTableBodyRecipe = cva({
  base: {
    backgroundColor: "transparent",
  },
});

export const dataTableRowRecipe = cva({
  base: {
    borderBottom: "thin",
    borderColor: "border.subtle",
    transition: "background-color 0.2s",
    _hover: {
      backgroundColor: "dark.surfaceHover",
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "rgba(33, 134, 235, 0.15)",
      },
    },
  },
});

export const dataTableCellRecipe = cva({
  base: {
    paddingX: 4,
    paddingY: 3,
    fontSize: "sm",
    color: "text.primary",
    borderRight: "thin",
    borderColor: "border.subtle",
    verticalAlign: "top",
    whiteSpace: "normal",
    wordBreak: "break-word",
    transition: "background-color 0.2s, color 0.2s",
    _last: {
      borderRight: "none",
    },
  },
  variants: {
    cellType: {
      text: {},
      name: {
        fontWeight: "semibold",
      },
      status: {
        fontWeight: "medium",
        color: "primary.200",
      },
      date: {
        fontFamily: "mono",
        color: "text.secondary",
        fontSize: "xs",
      },
      actions: {
        textAlign: "right",
      },
      any: {},
    },
    editable: {
      true: {
        cursor: "pointer",
        _hover: {
          backgroundColor: "dark.surfaceHover",
        },
      },
    },
  },
  defaultVariants: {
    cellType: "text",
    editable: false,
  },
});

export const dataTableSortIconRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "sm",
    color: "text.tertiary",
    transition: "color 0.2s",
    marginLeft: "auto",
  },
  variants: {
    active: {
      true: {
        color: "primary.300",
      },
    },
  },
});

export const dataTableEmptyStateRecipe = cva({
  base: {
    paddingY: 12,
    textAlign: "center",
    color: "text.secondary",
    fontSize: "md",
  },
});

export const dataTableGlobalFilterContainerRecipe = cva({
  base: {
    display: "flex",
    flexDirection: { base: "column", md: "row" },
    alignItems: { base: "stretch", md: "center" },
    gap: 3,
    paddingX: 4,
    paddingY: 3,
    borderBottom: "thin",
    borderColor: "border.default",
    backgroundColor: "dark.surface",
  },
});

export const dataTableGlobalFilterLabelRecipe = cva({
  base: {
    fontSize: "sm",
    color: "text.secondary",
  },
});

export const dataTableGlobalFilterInputRecipe = cva({
  base: {
    flex: 1,
    minWidth: { base: "auto", md: "16rem" },
    maxWidth: "28rem",
    paddingX: 3,
    paddingY: 2,
    fontSize: "sm",
    borderRadius: "md",
    border: "thin",
    borderColor: "border.default",
    backgroundColor: "dark.surfaceActive",
    color: "text.primary",
    transition: "border-color 0.2s, box-shadow 0.2s",
    _placeholder: {
      color: "text.secondary",
    },
    _focus: {
      outline: "none",
      borderColor: "primary.500",
      boxShadow: "0 0 0 2px rgba(33, 134, 235, 0.35)",
    },
  },
});

export const dataTablePaginationContainerRecipe = cva({
  base: {
    display: "flex",
    flexDirection: { base: "column", md: "row" },
    alignItems: { base: "flex-start", md: "center" },
    justifyContent: "space-between",
    gap: 3,
    paddingX: 4,
    paddingY: 3,
    borderTop: "thin",
    borderColor: "border.default",
    backgroundColor: "dark.surface",
  },
});

export const dataTablePaginationInfoRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    fontSize: "sm",
    color: "text.secondary",
  },
});

export const dataTablePaginationNavRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
});

export const dataTablePaginationButtonRecipe = cva({
  base: {
    minWidth: "2rem",
    height: "2rem",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "sm",
    fontWeight: "medium",
    borderRadius: "md",
    border: "thin",
    borderColor: "border.default",
    backgroundColor: "dark.surface",
    color: "text.secondary",
    cursor: "pointer",
    transition: "background-color 0.2s, color 0.2s, border-color 0.2s",
    _hover: {
      backgroundColor: "dark.surfaceHover",
      color: "text.primary",
    },
    _disabled: {
      opacity: 0.4,
      cursor: "not-allowed",
      pointerEvents: "none",
    },
  },
  variants: {
    variant: {
      nav: {},
      number: {},
      ellipsis: {
        border: "none",
        cursor: "default",
        backgroundColor: "transparent",
        color: "text.tertiary",
        pointerEvents: "none",
      },
    },
    active: {
      true: {
        backgroundColor: "primary.600",
        borderColor: "primary.600",
        color: "white",
        _hover: {
          backgroundColor: "primary.500",
        },
      },
    },
  },
  defaultVariants: {
    variant: "number",
    active: false,
  },
});

export const dataTablePaginationSelectRecipe = cva({
  base: {
    paddingX: 3,
    paddingY: 2,
    fontSize: "sm",
    borderRadius: "md",
    border: "thin",
    borderColor: "border.default",
    backgroundColor: "dark.surfaceActive",
    color: "text.primary",
    cursor: "pointer",
    transition: "border-color 0.2s, box-shadow 0.2s",
    _focus: {
      outline: "none",
      borderColor: "primary.500",
      boxShadow: "0 0 0 2px rgba(33, 134, 235, 0.35)",
    },
  },
});

export const dataTableBulkToolbarRecipe = cva({
  base: {
    display: "flex",
    flexDirection: { base: "column", md: "row" },
    alignItems: { base: "stretch", md: "center" },
    justifyContent: "space-between",
    gap: 3,
    paddingX: 4,
    paddingY: 3,
    backgroundColor: "rgba(33, 134, 235, 0.12)",
    borderBottom: "thin",
    borderColor: "primary.500",
  },
});

export const dataTableBulkInfoRecipe = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    color: "primary.200",
    fontWeight: "medium",
  },
});

export const dataTableBulkClearButtonRecipe = cva({
  base: {
    fontSize: "sm",
    color: "primary.200",
    textDecoration: "underline",
    cursor: "pointer",
    transition: "color 0.2s",
    _hover: {
      color: "primary.100",
    },
  },
});

export const dataTableBulkActionButtonRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    paddingX: 4,
    paddingY: 2,
    fontSize: "sm",
    fontWeight: "medium",
    color: "white",
    borderRadius: "md",
    backgroundColor: "status.error",
    transition: "background-color 0.2s",
    cursor: "pointer",
    _hover: {
      backgroundColor: "#dc2626",
    },
  },
});
