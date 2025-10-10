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

export const securityGroupsCardsContainerRecipe = cva({
  base: securityGroupsStyles.cardsContainer,
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
