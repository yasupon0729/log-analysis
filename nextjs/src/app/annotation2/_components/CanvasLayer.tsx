"use client";

// src/app/annotation2/_components/CanvasLayer.tsx

import { useEffect, useRef, useState } from "react";
import { css } from "../../../../styled-system/css";
import type { AnnotationRegion } from "../_types";

interface CanvasLayerProps {
  imageSrc: string; // 表示する画像のURL（Data URLでも可）
  width: number; // Canvasの論理幅
  height: number; // Canvasの論理高さ
  regions: AnnotationRegion[]; // 描画するアノテーション領域
  filteredIds: Set<number>;
  removedIds: Set<number>;
  hoveredId: number | null;
  editMode?: "select" | "draw"; // 編集モード
  onHover: (id: number | null) => void;
  onClick: (id: number) => void;
  onRangeSelect: (ids: number[]) => void;
  onAddRegion?: (points: { x: number; y: number }[]) => void; // 追加
}

export function CanvasLayer({
  imageSrc,
  width,
  height,
  regions,
  filteredIds,
  removedIds,
  hoveredId,
  editMode = "select",
  onHover,
  onClick,
  onRangeSelect,
  onAddRegion,
}: CanvasLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // ズーム・パン状態 (Transform)
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

  // ドラッグ状態管理
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  // パンニング状態
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(
    null,
  );

  // 描画モード用状態
  const [drawingPoints, setDrawingPoints] = useState<{ x: number; y: number }[]>(
    [],
  );
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const DRAG_THRESHOLD = 5;

  const finishDrawing = () => {
    if (drawingPoints.length >= 3 && onAddRegion) {
      onAddRegion(drawingPoints);
    }
    setDrawingPoints([]);
  };

  // 画像ロード & 描画ループ
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const image = imageRef.current;

    const draw = () => {
      if (!canvas || !ctx) return;

      // 1. 画面クリア
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // 2. ズーム・パンの適用
      ctx.setTransform(
        transform.scale,
        0,
        0,
        transform.scale,
        transform.x,
        transform.y,
      );

      // 3. 画像描画
      if (image) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, width, height);
      }

      // 4. アノテーション描画
      regions.forEach((region) => {
        const isRemoved = removedIds.has(region.id);
        const isFiltered = filteredIds.has(region.id);
        const isHovered = region.id === hoveredId;

        let fillStyle: string | null = null;
        let strokeStyle: string | null = null;
        let lineWidth = 1 / transform.scale;

        ctx.setLineDash([]);

        if (isRemoved) {
          fillStyle = isHovered
            ? "rgba(239, 68, 68, 0.6)"
            : "rgba(239, 68, 68, 0.35)";
          strokeStyle = "#dc2626";
        } else if (isFiltered) {
          fillStyle = "rgba(100, 116, 139, 0.05)";
          strokeStyle = "rgba(148, 163, 184, 0.6)";
          ctx.setLineDash([2 / transform.scale, 4 / transform.scale]);
        } else if (region.isManualAdded) {
          // 手動追加: 緑色 (Emerald)
          fillStyle = isHovered
            ? "rgba(16, 185, 129, 0.6)"
            : "rgba(16, 185, 129, 0.35)";
          strokeStyle = "#059669";
        } else {
          // 通常: 鮮やかなシアン/水色 (暗い背景でも明るい背景でも見やすい)
          fillStyle = isHovered
            ? "rgba(6, 182, 212, 0.5)"
            : "rgba(6, 182, 212, 0.25)";
          strokeStyle = isHovered ? "#0891b2" : "#06b6d4";
        }

        if (isHovered) {
          lineWidth = 2 / transform.scale;
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

      // 5. 範囲選択矩形の描画
      if (editMode === "select" && isDragging && dragStart && dragEnd) {
        const x = Math.min(dragStart.x, dragEnd.x);
        const y = Math.min(dragStart.y, dragEnd.y);
        const w = Math.abs(dragEnd.x - dragStart.x);
        const h = Math.abs(dragEnd.y - dragStart.y);

        ctx.strokeStyle = "rgba(234, 88, 12, 0.9)";
        ctx.lineWidth = 2 / transform.scale;
        ctx.setLineDash([6 / transform.scale, 4 / transform.scale]);
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = "rgba(251, 146, 60, 0.2)";
        ctx.fillRect(x, y, w, h);
        ctx.setLineDash([]);
      }

      // 6. 描画中のポリゴン表示 (Draw Mode)
      if (editMode === "draw" && drawingPoints.length > 0) {
        ctx.strokeStyle = "#22c55e"; // Green 500
        ctx.lineWidth = 2 / transform.scale;
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(drawingPoints[0].x, drawingPoints[0].y);
        for (let i = 1; i < drawingPoints.length; i++) {
          ctx.lineTo(drawingPoints[i].x, drawingPoints[i].y);
        }
        ctx.stroke();

        // 頂点マーカー
        ctx.fillStyle = "#22c55e";
        const r = 3 / transform.scale;
        drawingPoints.forEach((p) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        });

        // ラバーバンド
        if (mousePos) {
          ctx.beginPath();
          ctx.moveTo(
            drawingPoints[drawingPoints.length - 1].x,
            drawingPoints[drawingPoints.length - 1].y,
          );
          ctx.lineTo(mousePos.x, mousePos.y);
          ctx.strokeStyle = "rgba(34, 197, 94, 0.5)"; // 薄い緑
          ctx.setLineDash([4 / transform.scale, 4 / transform.scale]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };

    if (!imageRef.current || imageRef.current.src !== imageSrc) {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        imageRef.current = img;
        draw();
      };
    } else {
      draw();
    }
  }, [
    imageSrc,
    regions,
    filteredIds,
    removedIds,
    hoveredId,
    width,
    height,
    isDragging,
    dragStart,
    dragEnd,
    transform,
    editMode,
    drawingPoints, // 追加
    mousePos, // 追加
  ]);

  // --- 座標変換ヘルパー ---

  const getRawCoordinates = (
    e:
      | React.MouseEvent<HTMLCanvasElement>
      | React.WheelEvent<HTMLCanvasElement>,
  ) => {
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

  const toWorldCoordinates = (rawX: number, rawY: number) => {
    return {
      x: (rawX - transform.x) / transform.scale,
      y: (rawY - transform.y) / transform.scale,
    };
  };

  // --- イベントハンドラ ---

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const scaleBy = 1.1;
    const zoomIn = e.deltaY < 0;
    const factor = zoomIn ? scaleBy : 1 / scaleBy;

    const { x: rawX, y: rawY } = getRawCoordinates(e);
    const worldMouse = toWorldCoordinates(rawX, rawY);

    let newScale = transform.scale * factor;
    newScale = Math.max(0.1, Math.min(newScale, 20));

    const newX = rawX - worldMouse.x * newScale;
    const newY = rawY - worldMouse.y * newScale;

    setTransform({ scale: newScale, x: newX, y: newY });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const raw = getRawCoordinates(e);
    const world = toWorldCoordinates(raw.x, raw.y);

    if (editMode === "select") {
      setPanStart(raw);
      setDragStart(world);
      setDragEnd(world);
      setIsDragging(false);
    } else {
      // Drawモード
      if (e.shiftKey) {
        setPanStart(raw);
        setIsPanning(true);
      } else if (e.button === 0) {
        // 左クリック: 点追加
        setDrawingPoints((prev) => [...prev, world]);
      } else if (e.button === 2) {
        // 右クリック: 完了
        finishDrawing();
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const raw = getRawCoordinates(e);
    const world = toWorldCoordinates(raw.x, raw.y);

    setMousePos(world);

    if (panStart && editMode === "select") {
      if (isPanning) {
        const dx = raw.x - panStart.x;
        const dy = raw.y - panStart.y;
        setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setPanStart(raw);
        return;
      }

      if (isDragging) {
        setDragEnd(world);
        return;
      }

      const dxRaw = Math.abs(raw.x - panStart.x);
      const dyRaw = Math.abs(raw.y - panStart.y);

      if (dxRaw > DRAG_THRESHOLD || dyRaw > DRAG_THRESHOLD) {
        if (e.shiftKey) {
          setIsPanning(true);
          setDragStart(null);
          setDragEnd(null);
        } else {
          setIsDragging(true);
          setDragEnd(world);
        }
      }
      return;
    }

    if (
      (editMode === "draw" || editMode === "select") &&
      isPanning &&
      panStart
    ) {
      const dx = raw.x - panStart.x;
      const dy = raw.y - panStart.y;
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setPanStart(raw);
      return;
    }

    // フリーハンド描画 (Drawモード & 左クリックドラッグ)
    if (editMode === "draw" && e.buttons === 1 && !isPanning) {
      // 最後の点との距離をチェックして間引く
      const lastPoint = drawingPoints[drawingPoints.length - 1];
      if (lastPoint) {
        // World座標での距離
        const dist = Math.hypot(world.x - lastPoint.x, world.y - lastPoint.y);
        // 画面上のピクセル換算で閾値を超えたら追加
        if (dist * transform.scale > DRAG_THRESHOLD) {
          setDrawingPoints((prev) => [...prev, world]);
        }
      }
      // マウス位置更新（ラバーバンド用だが、ドラッグ中は線がつながって見える）
      setMousePos(world);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (editMode === "select") {
      let foundId: number | null = null;
      const x = world.x;
      const y = world.y;

      for (let i = regions.length - 1; i >= 0; i--) {
        const region = regions[i];
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
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }

    if (editMode === "select") {
      if (!dragStart) return;

      if (isDragging && dragEnd) {
        const minX = Math.min(dragStart.x, dragEnd.x);
        const maxX = Math.max(dragStart.x, dragEnd.x);
        const minY = Math.min(dragStart.y, dragEnd.y);
        const maxY = Math.max(dragStart.y, dragEnd.y);

        const selectedIds: number[] = [];

        regions.forEach((region) => {
          const [bx, by, bw, bh] = region.bbox;
          const centerX = bx + bw / 2;
          const centerY = by + bh / 2;
          if (
            centerX >= minX &&
            centerX <= maxX &&
            centerY >= minY &&
            centerY <= maxY
          ) {
            selectedIds.push(region.id);
          }
        });

        if (selectedIds.length > 0) {
          onRangeSelect(selectedIds);
        }
      } else {
        if (hoveredId !== null) {
          onClick(hoveredId);
        }
      }

      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }

    setPanStart(null);
  };

  // カーソルスタイルの決定
  let cursorStyle = "default";
  if (isPanning) {
    cursorStyle = "grabbing";
  } else if (editMode === "draw") {
    cursorStyle = "crosshair"; // 描画モード: 十字
  } else if (isDragging) {
    cursorStyle = "crosshair"; // 範囲選択中: 十字
  } else if (hoveredId) {
    cursorStyle = "pointer"; // ホバー中: 指
  } else {
    cursorStyle = "default";
  }

  const canvasClass = css({
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    border: "1px solid token(colors.gray.200)",
    borderRadius: "md",
    cursor: cursorStyle,
    boxShadow: "sm",
  });

  return (
    <div className={css({ overflow: "hidden", position: "relative" })}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={canvasClass}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          onHover(null);
          if (dragStart)
            handleMouseUp({} as React.MouseEvent<HTMLCanvasElement>);
        }}
        // 右クリックメニューを無効化（描画完了は onMouseDown で処理）
        onContextMenu={(e) => {
          e.preventDefault();
        }}
      />
      <div
        className={css({
          position: "absolute",
          bottom: 2,
          right: 2,
          backgroundColor: "rgba(255,255,255,0.8)",
          padding: "2px 6px",
          fontSize: "xs",
          borderRadius: "md",
          pointerEvents: "none",
        })}
      >
        Zoom: {Math.round(transform.scale * 100)}% (Shift+Drag to Pan)
      </div>
      {editMode === "draw" && (
        <div
          className={css({
            position: "absolute",
            top: 2,
            left: 2,
            backgroundColor: "rgba(0,0,0,0.6)",
            color: "white",
            padding: "4px 8px",
            fontSize: "xs",
            borderRadius: "md",
            pointerEvents: "none",
          })}
        >
          Click to add points. Right-click to finish.
        </div>
      )}
    </div>
  );
}
