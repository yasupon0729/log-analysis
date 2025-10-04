"use client";

import { css } from "@/styled-system/css";
import { gradientTextProps } from "@/styles/utils/gradient-text";

export default function Home() {
  return (
    <div
      className={css({
        padding: 8,
      })}
    >
      {/* Page Header */}
      <div
        className={css({
          mb: 8,
        })}
      >
        <h1
          className={css({
            fontSize: "3xl",
            fontWeight: "bold",
            mb: 2,
          })}
          style={gradientTextProps.style}
        >
          ログ解析ダッシュボード
        </h1>
        <p
          className={css({
            fontSize: "md",
            color: "text.secondary",
          })}
        >
          S3から直接ログを取得して解析します
        </p>
      </div>

      {/* Test Cards - Panda CSS 動作確認 */}
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: {
            base: "1fr",
            md: "repeat(2, 1fr)",
            lg: "repeat(3, 1fr)",
          },
          gap: 6,
        })}
      >
        {/* Primary Card */}
        <div
          className={css({
            bg: "dark.surface",
            borderRadius: "lg",
            p: 6,
            border: "thin",
            borderColor: "primary.700",
            transition: "all 0.2s",
            _hover: {
              transform: "translateY(-2px)",
              borderColor: "primary.500",
              boxShadow: "0 4px 12px rgba(9, 103, 210, 0.2)",
            },
          })}
        >
          <div
            className={css({
              fontSize: "2xl",
              mb: 3,
            })}
          >
            🎨
          </div>
          <h2
            className={css({
              fontSize: "xl",
              fontWeight: "semibold",
              color: "primary.400",
              mb: 2,
            })}
          >
            プライマリカラー
          </h2>
          <p
            className={css({
              color: "text.secondary",
              fontSize: "sm",
              lineHeight: "relaxed",
            })}
          >
            青系のメインカラーです。Panda CSSのトークンから色を適用しています。
          </p>
        </div>

        {/* Secondary Card */}
        <div
          className={css({
            bg: "dark.surface",
            borderRadius: "lg",
            p: 6,
            border: "thin",
            borderColor: "secondary.700",
            transition: "all 0.2s",
            _hover: {
              transform: "translateY(-2px)",
              borderColor: "secondary.500",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)",
            },
          })}
        >
          <div
            className={css({
              fontSize: "2xl",
              mb: 3,
            })}
          >
            ✅
          </div>
          <h2
            className={css({
              fontSize: "xl",
              fontWeight: "semibold",
              color: "secondary.400",
              mb: 2,
            })}
          >
            セカンダリカラー
          </h2>
          <p
            className={css({
              color: "text.secondary",
              fontSize: "sm",
              lineHeight: "relaxed",
            })}
          >
            緑系のセカンダリカラーです。成功状態やポジティブなアクションに使用します。
          </p>
        </div>

        {/* Tertiary Card */}
        <div
          className={css({
            bg: "dark.surface",
            borderRadius: "lg",
            p: 6,
            border: "thin",
            borderColor: "tertiary.700",
            transition: "all 0.2s",
            _hover: {
              transform: "translateY(-2px)",
              borderColor: "tertiary.500",
              boxShadow: "0 4px 12px rgba(236, 72, 153, 0.2)",
            },
          })}
        >
          <div
            className={css({
              fontSize: "2xl",
              mb: 3,
            })}
          >
            💖
          </div>
          <h2
            className={css({
              fontSize: "xl",
              fontWeight: "semibold",
              color: "tertiary.400",
              mb: 2,
            })}
          >
            ターシャリカラー
          </h2>
          <p
            className={css({
              color: "text.secondary",
              fontSize: "sm",
              lineHeight: "relaxed",
            })}
          >
            ピンク系の第3のカラーです。アクセントや特別な要素の強調に使用します。
          </p>
        </div>
      </div>

      {/* Status Examples */}
      <div
        className={css({
          mt: 8,
          display: "flex",
          gap: 4,
          flexWrap: "wrap",
        })}
      >
        <div
          className={css({
            px: 4,
            py: 2,
            borderRadius: "md",
            bg: "status.errorBg",
            color: "status.error",
            fontSize: "sm",
            fontWeight: "medium",
          })}
        >
          エラー
        </div>
        <div
          className={css({
            px: 4,
            py: 2,
            borderRadius: "md",
            bg: "status.warningBg",
            color: "status.warning",
            fontSize: "sm",
            fontWeight: "medium",
          })}
        >
          警告
        </div>
        <div
          className={css({
            px: 4,
            py: 2,
            borderRadius: "md",
            bg: "status.successBg",
            color: "status.success",
            fontSize: "sm",
            fontWeight: "medium",
          })}
        >
          成功
        </div>
        <div
          className={css({
            px: 4,
            py: 2,
            borderRadius: "md",
            bg: "status.infoBg",
            color: "status.info",
            fontSize: "sm",
            fontWeight: "medium",
          })}
        >
          情報
        </div>
      </div>
    </div>
  );
}
