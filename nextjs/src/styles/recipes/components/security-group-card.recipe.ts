import { cva } from "@/styled-system/css";

export const securityGroupCardRecipe = cva({
  base: {
    backgroundColor: "surface",
    borderRadius: "0.5rem",
    padding: "1rem",
    border: "2px solid",
    transition: "all 0.2s",
    "&:hover": {
      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    },
  },
  variants: {
    hasWarnings: {
      true: {
        borderColor: "warning",
      },
      false: {
        borderColor: "border",
      },
    },
  },
  defaultVariants: {
    hasWarnings: false,
  },
});

export const securityGroupCardHeaderRecipe = cva({
  base: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    cursor: "pointer",
    marginBottom: "0.5rem",
  },
});

export const securityGroupCardTitleContainerRecipe = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    flex: 1,
  },
});

export const securityGroupCardTitleRecipe = cva({
  base: {
    fontSize: "1.125rem",
    fontWeight: "600",
    color: "primary.400",
  },
});

export const securityGroupGroupIdRecipe = cva({
  base: {
    fontSize: "0.875rem",
    color: "text.secondary",
    fontFamily: "monospace",
  },
});

export const securityGroupCardMetaRecipe = cva({
  base: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    flexWrap: "wrap",
  },
});

export const securityGroupVpcBadgeRecipe = cva({
  base: {
    padding: "0.25rem 0.5rem",
    backgroundColor: "primary.100",
    color: "primary.600",
    borderRadius: "0.25rem",
    fontSize: "0.75rem",
    fontFamily: "monospace",
  },
});

export const securityGroupWarningBadgeContainerRecipe = cva({
  base: {
    display: "flex",
    gap: "0.5rem",
  },
});

export const securityGroupCriticalBadgeRecipe = cva({
  base: {
    padding: "0.25rem 0.5rem",
    backgroundColor: "error",
    color: "white",
    borderRadius: "0.25rem",
    fontSize: "0.75rem",
    fontWeight: "600",
  },
});

export const securityGroupWarningBadgeRecipe = cva({
  base: {
    padding: "0.25rem 0.5rem",
    backgroundColor: "warning",
    color: "black",
    borderRadius: "0.25rem",
    fontSize: "0.75rem",
    fontWeight: "600",
  },
});

export const securityGroupExpandButtonRecipe = cva({
  base: {
    padding: "0.25rem",
    backgroundColor: "transparent",
    color: "text.secondary",
    cursor: "pointer",
    transition: "transform 0.2s",
  },
});

export const securityGroupDescriptionRecipe = cva({
  base: {
    color: "text.secondary",
    fontSize: "0.875rem",
    marginBottom: "0.5rem",
  },
});

export const securityGroupDetailsRecipe = cva({
  base: {
    marginTop: "1rem",
    paddingTop: "1rem",
    borderTop: "1px solid",
    borderColor: "border",
  },
});

export const securityGroupWarningsSectionRecipe = cva({
  base: {
    marginBottom: "1.5rem",
    padding: "1rem",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: "0.375rem",
    border: "1px solid",
    borderColor: "error",
  },
});

export const securityGroupSectionTitleRecipe = cva({
  base: {
    fontSize: "1rem",
    fontWeight: "600",
    marginBottom: "0.75rem",
    color: "text.primary",
  },
});

export const securityGroupWarningItemRecipe = cva({
  base: {
    display: "flex",
    gap: "1rem",
    alignItems: "center",
    padding: "0.5rem",
    marginBottom: "0.5rem",
    borderRadius: "0.25rem",
  },
  variants: {
    level: {
      critical: {
        backgroundColor: "rgba(239, 68, 68, 0.1)",
      },
      warning: {
        backgroundColor: "rgba(245, 158, 11, 0.1)",
      },
    },
  },
});

export const securityGroupWarningLevelRecipe = cva({
  base: {
    padding: "0.125rem 0.5rem",
    borderRadius: "0.25rem",
    fontSize: "0.75rem",
    fontWeight: "600",
  },
  variants: {
    level: {
      critical: {
        backgroundColor: "error",
        color: "white",
      },
      warning: {
        backgroundColor: "warning",
        color: "black",
      },
    },
  },
});

export const securityGroupRulesSectionRecipe = cva({
  base: {
    marginBottom: "1.5rem",
  },
});

export const securityGroupNoRulesRecipe = cva({
  base: {
    color: "text.secondary",
    fontStyle: "italic",
  },
});

export const securityGroupRulesTableRecipe = cva({
  base: {
    fontSize: "0.875rem",
  },
});

export const securityGroupTableHeaderRecipe = cva({
  base: {
    display: "grid",
    gridTemplateColumns: "100px 100px 1fr 1fr",
    gap: "1rem",
    padding: "0.5rem",
    backgroundColor: "background",
    borderRadius: "0.25rem",
    fontWeight: "600",
    color: "text.secondary",
    marginBottom: "0.5rem",
  },
});

export const securityGroupTableRowRecipe = cva({
  base: {
    display: "grid",
    gridTemplateColumns: "100px 100px 1fr 1fr",
    gap: "1rem",
    padding: "0.5rem",
    borderBottom: "1px solid",
    borderColor: "border",
    "&:last-child": {
      borderBottom: "none",
    },
  },
});

export const securityGroupSourceRecipe = cva({
  base: {
    fontFamily: "monospace",
    fontSize: "0.875rem",
    wordBreak: "break-all",
  },
});
