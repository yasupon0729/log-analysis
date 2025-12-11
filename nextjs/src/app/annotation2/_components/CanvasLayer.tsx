"use client";

// src/app/annotation2/_components/CanvasLayer.tsx
//
// このファイルは、HTML5 Canvasを使用して画像とアノテーション領域を描画するクライアントコンポーネントです。
// 主に以下のファイルから参照・利用されます:
// - src/app/annotation2/_components/AnnotationPageClient.tsx: 親コンポーネントから表示するデータと描画領域のサイズを受け取り、描画を指示します。
// - src/app/annotation2/_types/index.ts: 描画対象となるアノテーション領域の型定義を利用します。

import { useEffect, useRef } from "react";
import { css } from "../../../../styled-system/css";
import type { AnnotationRegion } from "../_types";

interface CanvasLayerProps {
  imageSrc: string; // Base64形式の画像データ (data:image/png;base64,...)
  width: number; // Canvasの論理幅
  height: number; // Canvasの論理高さ
  regions: AnnotationRegion[]; // 描画するアノテーション領域の配列
  // 以下は次のステップで実装するインタラクション関連のPropsですが、今回は画像描画に集中します。
  filteredIds: Set<number>; // フィルタリングにより除外された領域のID
  removedIds: Set<number>; // ユーザーにより削除された領域のID
  hoveredId: number | null; // 現在ホバーされている領域のID
  onHover: (id: number | null) => void; // ホバーイベント発生時のコールバック
  onClick: (id: number) => void; // クリックイベント発生時のコールバック
}

export function CanvasLayer({
  imageSrc,
  width,
  height,
  regions,
  filteredIds, // 未使用 (後のステップで利用)
  removedIds, // 未使用 (後のステップで利用)
  hoveredId, // 未使用 (後のステップで利用)
  onHover, // 未使用 (後のステップで利用)
  onClick, // 未使用 (後のステップで利用)
}: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // 画像のロードと、データ変更時の描画処理を統合
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const image = imageRef.current;

    // Canvas描画関数 (useEffectの内部で定義)
    const draw = () => {
      if (!canvas || !ctx) {
        return;
      }

      ctx.clearRect(0, 0, width, height);
      if (image) {
        ctx.drawImage(image, 0, 0, width, height);
      }

      regions.forEach((region) => {
        // 削除済みのアノテーションも描画する（色を変える）
        const isRemoved = removedIds.has(region.id);
        const isFiltered = filteredIds.has(region.id);
        const isHovered = region.id === hoveredId;

        let fillStyle: string | null = null;
        let strokeStyle: string | null = null;
        let lineWidth = 1;

        if (isRemoved) {
          // 削除済み: 赤色
          fillStyle = isHovered
            ? "rgba(220, 38, 38, 0.45)" // ホバー時は濃い赤
            : "rgba(248, 113, 113, 0.35)"; // 通常時は薄い赤
          strokeStyle = "#dc2626"; // 赤色の枠線
        } else if (isFiltered) {
          // フィルタリング済み: 薄いグレー（非表示に近い）
          fillStyle = "rgba(200, 200, 200, 0.1)";
          strokeStyle = "rgba(200, 200, 200, 0.2)";
        } else {
          // 通常: 青色
          fillStyle = isHovered
            ? "rgba(37, 99, 235, 0.4)"
            : "rgba(37, 99, 235, 0.15)";
          strokeStyle = isHovered ? "#1d4ed8" : "#3b82f6";
        }

        if (isHovered) {
          lineWidth = 2;
        }

        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;

        ctx.beginPath();
        if (region.points.length > 0) {
          ctx.moveTo(region.points[0].x, region.points[0].y);
          for (let i = 1; i < region.points.length; i++) {
            ctx.lineTo(region.points[i].x, region.points[i].y);
          }
          ctx.closePath();
        }

        ctx.fill();
        ctx.stroke();
      });
    };

    // 画像がまだロードされていない場合はロードを試みる
    if (!imageRef.current || imageRef.current.src !== imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        imageRef.current = img;
        draw(); // 画像ロード後に描画
      };
      img.onerror = (err) => {
        console.error("Failed to load image for CanvasLayer:", err);
      };
    } else {
      draw(); // 画像が既にロードされている場合は直接描画
    }
  }, [imageSrc, regions, filteredIds, removedIds, hoveredId, width, height]);
  // Mouse Event Handling
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    // 描画サイズと内部解像度の比率を考慮して、Canvas内部座標に変換
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Hit Test (Point-in-Polygon アルゴリズム)
    // 描画順序に配慮し、最も手前（最後に追加されたもの）から判定します。
    let foundId: number | null = null;
    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i];
      // 削除済み領域も再クリックで復活させるために当たり判定の対象にする
      // if (removedIds.has(region.id)) continue;

      // Point-in-Polygon: レイキャスティングアルゴリズム
      // 領域の外側に水平なレイを飛ばし、交差回数を数えます。奇数回なら内部。
      let inside = false;
      const points = region.points;
      for (let j = 0, k = points.length - 1; j < points.length; k = j++) {
        const xi = points[j].x;
        const yi = points[j].y;
        const xj = points[k].x;
        const yj = points[k].y;

        const intersect: boolean =
          yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }

      if (inside) {
        foundId = region.id;
        break; // 最初に見つかった領域でループを終了
      }
    }

    onHover(foundId); // 親コンポーネントにホバー状態を通知
  };

  // Canvasクリックイベントハンドラ
  const handleClick = () => {
    // 現在ホバーされている領域があれば、クリックイベントとして親に通知
    if (hoveredId !== null) {
      onClick(hoveredId);
    }
  };

  // UIスタイリング: Panda CSSを使用
  const canvasClass = css({
    width: "100%", // 親要素に合わせて幅を調整
    maxWidth: "100%",
    height: "auto", // アスペクト比を維持
    border: "1px solid token(colors.gray.200)", // 枠線
    borderRadius: "md", // 角丸
    cursor: "crosshair", // マウスカーソル
    boxShadow: "sm", // 影
  });

  return (
    <canvas
      ref={canvasRef}
      width={width} // Canvas要素の内部解像度を設定
      height={height}
      className={canvasClass}
      onMouseMove={handleMouseMove} // マウス移動イベント
      onMouseLeave={() => onHover(null)} // マウスがCanvasから離れたらホバー解除
      onClick={handleClick} // クリックイベント
    />
  );
}
