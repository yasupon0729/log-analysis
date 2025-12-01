"use client";

import { css } from "@/styled-system/css";

const pageClass = css({
  display: "flex",
  flexDirection: "column",
  gap: 6,
});

const titleClass = css({
  fontSize: "2xl",
  fontWeight: "bold",
  color: "text.primary",
});

const messageClass = css({
  fontSize: "sm",
  color: "text.muted",
});

const cardClass = css({
  padding: 6,
  backgroundColor: "bg.surface",
  borderRadius: "lg",
  border: "1px solid",
  borderColor: "border.default",
  boxShadow: "sm",
});

export default function RecommendationPageClient() {
  return (
    <div className={pageClass}>
      <header>
        <h1 className={titleClass}>推薦システム</h1>
        <p className={messageClass}>
          ログ分析に基づいたセキュリティ対策の推奨事項を表示します。
        </p>
      </header>

      <div className={cardClass}>
        <p>現在、推薦アルゴリズムを構築中です。</p>
        <p>将来的には以下の機能が提供される予定です：</p>
        <ul
          className={css({
            listStyleType: "disc",
            paddingLeft: 5,
            marginTop: 4,
          })}
        >
          <li>異常検知に基づいたアラート</li>
          <li>セキュリティグループ設定の最適化提案</li>
          <li>アクセスパターンの分析と推奨ポリシー</li>
        </ul>
      </div>
    </div>
  );
}
