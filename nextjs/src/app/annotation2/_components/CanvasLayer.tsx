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
  onHover: (id: number | null) => void;
  onClick: (id: number) => void;
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

  // ズーム・パン状態 (Transform)
  // scale: 拡大率, x: 水平移動量, y: 垂直移動量
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

  // ドラッグ状態管理
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  ); // World座標
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null); // World座標

  // パンニング（視点移動）用のドラッグ状態
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(
    null,
  ); // Raw座標

  const DRAG_THRESHOLD = 5;

  // 画像ロード & 描画ループ
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const image = imageRef.current;

    const draw = () => {
      if (!canvas || !ctx) return;

      // 1. 画面クリア（Transformリセットして全体をクリア）
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
        // 画像品質を高めるための設定（任意）
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, width, height);
      }

      // 4. アノテーション描画
      regions.forEach((region) => {
        // 削除済み領域の描画制御
        // if (removedIds.has(region.id)) return;

        const isRemoved = removedIds.has(region.id);
        const isFiltered = filteredIds.has(region.id);
        const isHovered = region.id === hoveredId;

        let fillStyle: string | null = null;
        let strokeStyle: string | null = null;
        let lineWidth = 1 / transform.scale; // ズームしても線の太さを一定に見せるため

        ctx.setLineDash([]);

        if (isRemoved) {
          // 削除済み: 赤色 (ユーザー要望: removeのものは赤く、最優先)
          fillStyle = isHovered
            ? "rgba(239, 68, 68, 0.6)"
            : "rgba(239, 68, 68, 0.35)"; // Red 500
          strokeStyle = "#dc2626"; // Red 600
        } else if (isFiltered) {
          // フィルタ対象: 枠線を目立たなくし、塗りつぶしはほぼ無し
          fillStyle = "rgba(100, 116, 139, 0.05)"; // Slate 500
          strokeStyle = "rgba(148, 163, 184, 0.6)"; // Slate 400
          // 点線にする (ズームに合わせてピッチ調整)
          ctx.setLineDash([2 / transform.scale, 4 / transform.scale]);
        } else {
          // 通常: 鮮やかなシアン/水色 (暗い背景でも明るい背景でも見やすい)
          fillStyle = isHovered
            ? "rgba(6, 182, 212, 0.5)"
            : "rgba(6, 182, 212, 0.25)";
          strokeStyle = isHovered ? "#0891b2" : "#06b6d4"; // Cyan 600 / 500
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

      // 5. 範囲選択矩形の描画 (World座標系で描画)
      if (isDragging && dragStart && dragEnd) {
        const x = Math.min(dragStart.x, dragEnd.x);
        const y = Math.min(dragStart.y, dragEnd.y);
        const w = Math.abs(dragEnd.x - dragStart.x);
        const h = Math.abs(dragEnd.y - dragStart.y);

        ctx.strokeStyle = "rgba(234, 88, 12, 0.9)";
        ctx.lineWidth = 2 / transform.scale;
        ctx.setLineDash([6 / transform.scale, 4 / transform.scale]); // 点線もスケール対応
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = "rgba(251, 146, 60, 0.2)";
        ctx.fillRect(x, y, w, h);

        ctx.setLineDash([]);
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
  ]);

  // --- 座標変換ヘルパー ---

  // イベント(Display)座標 -> CanvasRaw座標 (内部解像度)
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

  // CanvasRaw座標 -> World座標 (画像/アノテーション座標)
  const toWorldCoordinates = (rawX: number, rawY: number) => {
    return {
      x: (rawX - transform.x) / transform.scale,
      y: (rawY - transform.y) / transform.scale,
    };
  };

  // World座標 -> CanvasRaw座標 (逆変換)
  // const toRawCoordinates = (worldX: number, worldY: number) => {
  //   return {
  //     x: worldX * transform.scale + transform.x,
  //     y: worldY * transform.scale + transform.y,
  //   };
  // };

  // --- イベントハンドラ ---

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // ページスクロール防止は親要素またはCSSで制御が必要な場合があるが、
    // ここではCanvas上でのイベントのみpreventする
    // ただし、Passive Event Listenerの問題が出る可能性があるため、
    // 本当は useEffect で addEventListener するのが正しいが、ReactのonWheelでも動くことが多い。
    // e.preventDefault(); // ReactのSyntheticEventでは効かない場合がある

    const scaleBy = 1.1;
    const zoomIn = e.deltaY < 0;
    const factor = zoomIn ? scaleBy : 1 / scaleBy;

    const { x: rawX, y: rawY } = getRawCoordinates(e);

    // ズーム中心点の計算 (World座標)
    const worldMouse = toWorldCoordinates(rawX, rawY);

    // 新しいスケール
    // 制限を設ける (例: 0.1倍 ～ 20倍)
    let newScale = transform.scale * factor;
    newScale = Math.max(0.1, Math.min(newScale, 20));

    // 新しいオフセット
    // ズーム後も、マウス位置(Raw)が同じWorld座標を指すように調整
    // rawX = worldMouse.x * newScale + newX
    // newX = rawX - worldMouse.x * newScale
    const newX = rawX - worldMouse.x * newScale;
    const newY = rawY - worldMouse.y * newScale;

    setTransform({ scale: newScale, x: newX, y: newY });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const raw = getRawCoordinates(e);
    const world = toWorldCoordinates(raw.x, raw.y);

    // パンニング開始判定のためにRaw座標を保存
    setPanStart(raw);

    // 範囲選択開始（候補）
    setDragStart(world);
    setDragEnd(world);
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const raw = getRawCoordinates(e);
    const world = toWorldCoordinates(raw.x, raw.y);

    // --- ドラッグ中 (範囲選択 or パンニング) ---
    if (panStart) {
      if (isPanning) {
        // パンニング実行
        const dx = raw.x - panStart.x;
        const dy = raw.y - panStart.y;
        setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setPanStart(raw); // 次回の差分計算のために更新
        return;
      }

      if (isDragging) {
        // 範囲選択実行
        setDragEnd(world);
        return;
      }

      // --- まだドラッグ確定していない場合: 判定ロジック ---
      const dxRaw = Math.abs(raw.x - panStart.x);
      const dyRaw = Math.abs(raw.y - panStart.y);

      if (dxRaw > DRAG_THRESHOLD || dyRaw > DRAG_THRESHOLD) {
        // どちらのドラッグか判定する
        // アノテーション上でない場所をクリックしていたらパンニングにする？
        // 今回はシンプルに:
        // 「アノテーション上で開始した」または「Shiftキー等が押されている」なら範囲選択
        // そうでなければパンニング、という分岐も考えられるが、
        // 今の仕様は「ドラッグ＝範囲選択」が基本。
        // ここでは「範囲選択」を優先し、パンニングはSpaceキーなどを併用...と言いたいが、
        // 要望は「ズーム」なので、移動手段としてパンニングも欲しい。
        // -> **右クリック** または **ホイールボタン** ドラッグでパンニングにしますか？
        // -> あるいは、アノテーションがない場所からのドラッグはパンニング？

        // 暫定仕様:
        // 範囲選択を優先。パンニングは今のところ未実装とする（ズーム倍率を変えれば移動できるため）。
        // ただし、ズームしすぎると端に行けないので、やはりパンニングは必要。
        // 「Shiftキーを押しながらドラッグ」でパンニングにします。
        if (e.shiftKey) {
          setIsPanning(true);
          // 範囲選択のリセット
          setDragStart(null);
          setDragEnd(null);
        } else {
          setIsDragging(true);
          setDragEnd(world);
        }
      }
      return;
    }

    // --- ホバー判定 (ドラッグしていない時) ---
    const canvas = canvasRef.current;
    if (!canvas) return;

    let foundId: number | null = null;
    // World座標で判定
    const x = world.x;
    const y = world.y;

    for (let i = regions.length - 1; i >= 0; i--) {
      const region = regions[i];
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

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }

    if (!dragStart) return;

    if (isDragging && dragEnd) {
      // 範囲選択ロジック (World座標で判定)
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
      // クリック処理 (移動なし)
      if (hoveredId !== null) {
        onClick(hoveredId);
      }
    }

    setIsDragging(false);
    setIsPanning(false);
    setDragStart(null);
    setDragEnd(null);
    setPanStart(null);
  };

  const canvasClass = css({
    width: "100%",
    maxWidth: "100%",
    height: "auto",
    border: "1px solid token(colors.gray.200)",
    borderRadius: "md",
    cursor: isPanning ? "grabbing" : "crosshair",
    boxShadow: "sm",
  });

  return (
    <div className={css({ overflow: "hidden", position: "relative" })}>
      {/* 親divでoverflow:hiddenしておかないと、パンニングで画像が枠外に出た時に見えるかも */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={canvasClass}
        onWheel={handleWheel} // ズーム
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          onHover(null);
          if (dragStart)
            handleMouseUp({} as React.MouseEvent<HTMLCanvasElement>);
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
    </div>
  );
}
