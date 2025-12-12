"use client";

// src/app/annotation2/_components/CanvasLayer.tsx
//
// このファイルは、HTML5 Canvasを使用して画像とアノテーション領域を描画するクライアントコンポーネントです。
// 主に以下のファイルから参照・利用されます:
// - src/app/annotation2/_components/AnnotationPageClient.tsx: 親コンポーネントから表示するデータと描画領域のサイズを受け取り、描画を指示します。
// - src/app/annotation2/_types/index.ts: 描画対象となるアノテーション領域の型定義を利用します。

import { useEffect, useRef, useState } from "react";
import { css } from "../../../../styled-system/css";
import type { AnnotationRegion } from "../_types";

interface CanvasLayerProps {
  imageSrc: string; // Base64形式の画像データ (data:image/png;base64,...)
  width: number; // Canvasの論理幅
  height: number; // Canvasの論理高さ
  regions: AnnotationRegion[]; // 描画するアノテーション領域の配列
  filteredIds: Set<number>; // フィルタリングにより除外された領域のID
  removedIds: Set<number>; // ユーザーにより削除された領域のID
  hoveredId: number | null; // 現在ホバーされている領域のID
  onHover: (id: number | null) => void; // ホバーイベント発生時のコールバック
  onClick: (id: number) => void; // クリックイベント発生時のコールバック
  
  // 範囲選択機能用
  onRangeSelect: (ids: number[]) => void;
}

export function CanvasLayer({
  imageSrc,
  width,
  height,
  regions,
  filteredIds,
  removedIds,
  hoveredId,
  onHover,
  onClick,
  onRangeSelect,
}: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // ドラッグ状態管理
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);
  
  // ドラッグと判定するための閾値 (ピクセル)
  const DRAG_THRESHOLD = 5;

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
        if (removedIds.has(region.id)) {
          // return; // 削除済みも描画する
        }

        const isRemoved = removedIds.has(region.id);
        const isFiltered = filteredIds.has(region.id);
        const isHovered = region.id === hoveredId;

        let fillStyle: string | null = null;
        let strokeStyle: string | null = null;
        let lineWidth = 1;

        if (isRemoved) {
          // 削除済み: 赤色
          fillStyle = isHovered
            ? "rgba(220, 38, 38, 0.45)"
            : "rgba(248, 113, 113, 0.35)";
          strokeStyle = "#dc2626";
        } else if (isFiltered) {
          // フィルタリング済み: 薄いグレー
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

      // 範囲選択矩形の描画
      if (isDragging && dragStart && dragEnd) {
        const x = Math.min(dragStart.x, dragEnd.x);
        const y = Math.min(dragStart.y, dragEnd.y);
        const w = Math.abs(dragEnd.x - dragStart.x);
        const h = Math.abs(dragEnd.y - dragStart.y);

        ctx.strokeStyle = "rgba(234, 88, 12, 0.9)"; // Orange
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]); // 点線
        ctx.strokeRect(x, y, w, h);
        
        ctx.fillStyle = "rgba(251, 146, 60, 0.2)";
        ctx.fillRect(x, y, w, h);
        
        ctx.setLineDash([]); // 点線をリセット
      }
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

  }, [imageSrc, regions, filteredIds, removedIds, hoveredId, width, height, isDragging, dragStart, dragEnd]);

  // 座標変換ヘルパー
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Mouse Event Handling
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);
    setDragStart(coords);
    setDragEnd(coords);
    setIsDragging(false); // まだドラッグとはみなさない
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);

    // ドラッグ中の処理
    if (dragStart) {
      // 既にドラッグ中、または閾値を超えた場合にドラッグ開始
      if (isDragging) {
        setDragEnd(coords);
      } else {
        const dx = Math.abs(coords.x - dragStart.x);
        const dy = Math.abs(coords.y - dragStart.y);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
          setIsDragging(true);
          setDragEnd(coords);
        }
      }
      return;
    }

    // ホバー判定 (ドラッグしていない時)
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { x, y } = coords;

    // Hit Test (Point-in-Polygon アルゴリズム)
    let foundId: number | null = null;
    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i];
      // 削除済み領域も再クリックで復活させるために当たり判定の対象にする
      // if (removedIds.has(region.id)) continue;

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
        break; 
      }
    }

    onHover(foundId);
  };

  const handleMouseUp = () => {
    if (!dragStart) return;

    if (isDragging && dragEnd) {
      // 範囲選択ロジック
      const minX = Math.min(dragStart.x, dragEnd.x);
      const maxX = Math.max(dragStart.x, dragEnd.x);
      const minY = Math.min(dragStart.y, dragEnd.y);
      const maxY = Math.max(dragStart.y, dragEnd.y);

      const selectedIds: number[] = [];

      regions.forEach(region => {
          // 簡易判定: バウンディングボックスの中心点が選択範囲に含まれるか
          const [bx, by, bw, bh] = region.bbox;
          const centerX = bx + bw / 2;
          const centerY = by + bh / 2;

          if (centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY) {
              selectedIds.push(region.id);
          }
      });

      if (selectedIds.length > 0) {
          onRangeSelect(selectedIds);
      }
    } else {
      // クリック処理（ドラッグとみなされなかった場合）
      // MouseUpの時点でのホバーIDを使用する（MouseMoveで更新されているはず）
      if (hoveredId !== null) {
        onClick(hoveredId);
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  };

  // UIスタイリング: Panda CSSを使用
  const canvasClass = css({
    width: "100%", // 親要素に合わせて幅を調整
    maxWidth: "100%",
    height: "auto", // アスペクト比を維持
    border: "1px solid token(colors.gray.200)", // 枠線
    borderRadius: "md", // 角丸
    cursor: "crosshair", // マウスカーソル (常にcrosshairでOK、またはドラッグ中は変えるなども可)
    boxShadow: "sm", // 影
  });

  return (
    <canvas
      ref={canvasRef}
      width={width} // Canvas要素の内部解像度を設定
      height={height}
      className={canvasClass}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove} // マウス移動イベント
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
          onHover(null);
          if(dragStart) handleMouseUp(); // ドラッグ中に外に出たら終了処理
      }}
      // onClickはhandleMouseUpに統合したため削除
    />
  );
}
