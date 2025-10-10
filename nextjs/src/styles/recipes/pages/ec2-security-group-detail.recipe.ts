import { cva } from "@/styled-system/css";

import { securityGroupDetailStyles } from "./ec2-security-group-detail.styles";

export const securityGroupDetailContainerRecipe = cva({
  base: securityGroupDetailStyles.container,
});

export const securityGroupDetailHeaderRecipe = cva({
  base: securityGroupDetailStyles.header,
});

export const securityGroupDetailBackLinkRecipe = cva({
  base: securityGroupDetailStyles.backLink,
});

export const securityGroupDetailTitleRecipe = cva({
  base: securityGroupDetailStyles.title,
});

export const securityGroupDetailSubtitleRecipe = cva({
  base: securityGroupDetailStyles.subtitle,
});

export const securityGroupDetailMetaListRecipe = cva({
  base: securityGroupDetailStyles.metaList,
});

export const securityGroupDetailMetaItemRecipe = cva({
  base: securityGroupDetailStyles.metaItem,
});

export const securityGroupDetailDescriptionRecipe = cva({
  base: securityGroupDetailStyles.description,
});

export const securityGroupDetailInfoGridRecipe = cva({
  base: securityGroupDetailStyles.infoGrid,
});

export const securityGroupDetailInfoCardRecipe = cva({
  base: securityGroupDetailStyles.infoCard,
});

export const securityGroupDetailInfoLabelRecipe = cva({
  base: securityGroupDetailStyles.infoLabel,
});

export const securityGroupDetailInfoValueRecipe = cva({
  base: securityGroupDetailStyles.infoValue,
});

export const securityGroupDetailSectionRecipe = cva({
  base: securityGroupDetailStyles.section,
});

export const securityGroupDetailSectionHeaderRecipe = cva({
  base: securityGroupDetailStyles.sectionHeader,
});

export const securityGroupDetailSectionTitleRecipe = cva({
  base: securityGroupDetailStyles.sectionTitle,
});

export const securityGroupDetailSectionSubtitleRecipe = cva({
  base: securityGroupDetailStyles.sectionSubtitle,
});

export const securityGroupDetailTagListRecipe = cva({
  base: securityGroupDetailStyles.tagList,
});

export const securityGroupDetailTagChipRecipe = cva({
  base: securityGroupDetailStyles.tagChip,
});

export const securityGroupDetailFormContainerRecipe = cva({
  base: securityGroupDetailStyles.formContainer,
});

export const securityGroupDetailFormGridRecipe = cva({
  base: securityGroupDetailStyles.formGrid,
});

export const securityGroupDetailFormFieldRecipe = cva({
  base: securityGroupDetailStyles.formField,
  variants: {
    span: {
      full: securityGroupDetailStyles.formFieldFull,
    },
  },
});

export const securityGroupDetailFormLabelRecipe = cva({
  base: securityGroupDetailStyles.formLabel,
});

export const securityGroupDetailFormInputRecipe = cva({
  base: securityGroupDetailStyles.formInput,
});

export const securityGroupDetailFormActionsRecipe = cva({
  base: securityGroupDetailStyles.formActions,
});

export const securityGroupDetailFormMessageRecipe = cva({
  base: securityGroupDetailStyles.formMessage,
  variants: {
    tone: {
      error: securityGroupDetailStyles.formMessageError,
      success: securityGroupDetailStyles.formMessageSuccess,
    },
  },
});

export const securityGroupDetailFormHelperRecipe = cva({
  base: securityGroupDetailStyles.formHelper,
});

export const securityGroupDetailFormHelperRowRecipe = cva({
  base: securityGroupDetailStyles.formHelperRow,
});

export const securityGroupDetailFormCheckboxLabelRecipe = cva({
  base: securityGroupDetailStyles.formCheckboxLabel,
});

export const securityGroupDetailFormHelperButtonRecipe = cva({
  base: securityGroupDetailStyles.formHelperButton,
});
