import { css } from "@/styled-system/css";

export const gradientTextStyle = css({
  background:
    "linear-gradient(135deg, token(colors.primary.400) 0%, token(colors.secondary.400) 50%, token(colors.tertiary.400) 100%)",
  backgroundClip: "text",
  color: "transparent",
});

// グラデーションテキスト用のスタイル属性を生成
export const gradientTextProps = {
  style: {
    background:
      "linear-gradient(135deg, #47a3f3 0%, #34d399 50%, #f472b6 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
};
