import { cva } from "@/styled-system/css";

import { securityGroupsStyles } from "./ec2-security-groups.styles";

export const securityGroupsContainerRecipe = cva({
  base: securityGroupsStyles.container,
});

export const securityGroupsHeaderRecipe = cva({
  base: securityGroupsStyles.header,
});

export const securityGroupsTitleRecipe = cva({
  base: securityGroupsStyles.title,
});

export const securityGroupsFiltersRecipe = cva({
  base: securityGroupsStyles.filters,
});

export const securityGroupsFilterGroupRecipe = cva({
  base: securityGroupsStyles.filterGroup,
});

export const securityGroupsLabelRecipe = cva({
  base: securityGroupsStyles.label,
});

export const securityGroupsInputRecipe = cva({
  base: securityGroupsStyles.input,
});

export const securityGroupsSelectRecipe = cva({
  base: securityGroupsStyles.select,
});

export const securityGroupsCheckboxLabelRecipe = cva({
  base: securityGroupsStyles.checkboxLabel,
});

export const securityGroupsCheckboxRecipe = cva({
  base: securityGroupsStyles.checkbox,
});

export const securityGroupsTableContainerRecipe = cva({
  base: securityGroupsStyles.tableContainer,
});

export const securityGroupsTableRecipe = cva({
  base: securityGroupsStyles.table,
});

export const securityGroupsTableHeaderRowRecipe = cva({
  base: securityGroupsStyles.tableHeaderRow,
});

export const securityGroupsTableHeaderCellRecipe = cva({
  base: securityGroupsStyles.tableHeaderCell,
});

export const securityGroupsTableRowRecipe = cva({
  base: securityGroupsStyles.tableBodyRow,
  variants: {
    clickable: {
      true: securityGroupsStyles.tableBodyRowClickable,
      false: {},
    },
  },
  defaultVariants: {
    clickable: true,
  },
});

export const securityGroupsTableCellRecipe = cva({
  base: securityGroupsStyles.tableCell,
});

export const securityGroupsTableNameCellRecipe = cva({
  base: securityGroupsStyles.tableNameCell,
});

export const securityGroupsTableNameTitleRecipe = cva({
  base: securityGroupsStyles.tableNameTitle,
});

export const securityGroupsTableNameMetaRecipe = cva({
  base: securityGroupsStyles.tableNameMeta,
});

export const securityGroupsTableDescriptionRecipe = cva({
  base: securityGroupsStyles.tableDescription,
});

export const securityGroupsTableCountsRecipe = cva({
  base: securityGroupsStyles.tableCounts,
});

export const securityGroupsWarningListRecipe = cva({
  base: securityGroupsStyles.warningList,
});

export const securityGroupsWarningChipRecipe = cva({
  base: securityGroupsStyles.warningChip,
  variants: {
    level: {
      critical: securityGroupsStyles.warningChipCritical,
      warning: securityGroupsStyles.warningChipWarning,
    },
  },
});

export const securityGroupsLoadingContainerRecipe = cva({
  base: securityGroupsStyles.loadingContainer,
});

export const securityGroupsSpinnerRecipe = cva({
  base: securityGroupsStyles.spinner,
});

export const securityGroupsErrorContainerRecipe = cva({
  base: securityGroupsStyles.errorContainer,
});

export const securityGroupsNoResultsRecipe = cva({
  base: securityGroupsStyles.noResults,
});
