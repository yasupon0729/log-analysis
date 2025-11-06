"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { css } from "@/styled-system/css";

const CANVAS_WIDTH = 1049;
const CANVAS_HEIGHT = 695;
const IMAGE_PATH = "/annotation-sample.png";
const IMAGE_ID = "annotation-sample";

interface HitResponse {
  ok: boolean;
  ids: string[];
  roiImage?: string;
  message?: string;
}

interface UpdateInstancesResponse {
  ok: boolean;
  disabledIds?: string[];
  message?: string;
}

const containerClass = css({
  display: "grid",
  gridTemplateColumns: { base: "1fr", xl: "minmax(0, 3fr) minmax(0, 2fr)" },
  gap: { base: "20px", md: "28px", lg: "36px" },
  padding: { base: "20px", md: "32px" },
  maxWidth: "1440px",
  marginX: "auto",
  width: "100%",
});

const canvasSectionClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "18px",
});

const titleClass = css({
  fontSize: { base: "xl", md: "2xl" },
  fontWeight: "semibold",
});

const subtitleClass = css({
  color: "gray.600",
  fontSize: { base: "sm", md: "md" },
  lineHeight: "1.6",
});

const imageWrapperClass = css({
  position: "relative",
  width: "100%",
  borderWidth: "1px",
  borderColor: "gray.200",
  borderRadius: "16px",
  overflow: "hidden",
  backgroundColor: "gray.100",
  boxShadow: "lg",
  aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
});

const baseImageClass = css({
  width: "100%",
  height: "100%",
  display: "block",
});

const cursorRingClass = css({
  position: "absolute",
  width: "32px",
  height: "32px",
  marginLeft: "-16px",
  marginTop: "-16px",
  borderRadius: "9999px",
  borderWidth: "2px",
  borderColor: "rgba(59, 130, 246, 0.75)",
  backgroundColor: "rgba(59, 130, 246, 0.25)",
  pointerEvents: "none",
  transition: "transform 120ms ease, opacity 140ms ease",
});

const helperTextClass = css({
  color: "gray.600",
  fontSize: { base: "sm", md: "md" },
});

const errorBannerClass = css({
  padding: "12px 16px",
  borderRadius: "12px",
  backgroundColor: "rgba(220, 38, 38, 0.12)",
  color: "rgb(153, 27, 27)",
  fontSize: "sm",
});

const statusBannerClass = css({
  padding: "12px 16px",
  borderRadius: "12px",
  backgroundColor: "rgba(37, 99, 235, 0.12)",
  color: "rgb(37, 99, 235)",
  fontSize: "sm",
});

const sidePanelClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  borderWidth: "1px",
  borderColor: "gray.200",
  borderRadius: "16px",
  padding: "20px",
  backgroundColor: "white",
  boxShadow: "lg",
});

const roiImageClass = css({
  width: "100%",
  borderRadius: "12px",
  borderWidth: "1px",
  borderColor: "rgba(59, 130, 246, 0.35)",
  backgroundColor: "rgba(30, 41, 59, 0.12)",
});

const selectionListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  fontSize: "sm",
  color: "gray.700",
});

const cursorInitialState = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, visible: false };

export function AnnotationCanvas3Client() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [cursorPosition, setCursorPosition] = useState(cursorInitialState);
  const [roiImage, setRoiImage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const updateCursorPosition = useCallback((x: number, y: number, visible: boolean) => {
    setCursorPosition({ x, y, visible });
  }, []);

  const translatePointerToImageCoords = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const wrapper = wrapperRef.current;
      if (!wrapper) {
        return null;
      }
      const rect = wrapper.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      return { x, y };
    },
    [],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const coords = translatePointerToImageCoords(event);
      if (!coords) {
        return;
      }
      updateCursorPosition(coords.x, coords.y, true);
    },
    [translatePointerToImageCoords, updateCursorPosition],
  );

  const handlePointerLeave = useCallback(() => {
    updateCursorPosition(cursorPosition.x, cursorPosition.y, false);
  }, [cursorPosition.x, cursorPosition.y, updateCursorPosition]);

  const handleCanvasClick = useCallback(
    async (event: ReactPointerEvent<HTMLDivElement>) => {
      const coords = translatePointerToImageCoords(event);
      if (!coords || isProcessing) {
        return;
      }

      updateCursorPosition(coords.x, coords.y, true);
      setIsProcessing(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/annotation3/hit", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: IMAGE_ID, x: coords.x, y: coords.y }),
        });

        if (!response.ok) {
          throw new Error(`hit request failed: ${response.status}`);
        }

        const payload = (await response.json()) as HitResponse;
        if (!payload.ok) {
          throw new Error(payload.message ?? "Hit-test failed");
        }

        if (payload.ids.length > 0) {
          setSelectedIds((prev) => new Set([...prev, ...payload.ids]));
        }
        if (payload.roiImage) {
          setRoiImage(payload.roiImage);
        }

        if (payload.ids.length === 0) {
          setStatusMessage("該当する領域は見つかりませんでした。");
        } else {
          setStatusMessage(`${payload.ids.length} 件の領域がヒットしました。`);
        }
        setTimeout(() => setStatusMessage(null), 3200);
      } catch (error) {
        const message = error instanceof Error ? error.message : "ヒットテストに失敗しました";
        setErrorMessage(message);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, translatePointerToImageCoords, updateCursorPosition],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setRoiImage(null);
  }, []);

  const handleDisableSelected = useCallback(async () => {
    if (selectedIds.size === 0) {
      setStatusMessage("キューに領域がありません。");
      setTimeout(() => setStatusMessage(null), 2400);
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    const ids = Array.from(selectedIds);
    try {
      const response = await fetch("/api/annotation3/instances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, disabled: true }),
      });

      if (!response.ok) {
        throw new Error(`disable request failed: ${response.status}`);
      }

      const payload = (await response.json()) as UpdateInstancesResponse;
      if (!payload.ok) {
        throw new Error(payload.message ?? "領域の更新に失敗しました");
      }

      setStatusMessage(`${ids.length} 件の領域を無効化しました (モック)。`);
      setSelectedIds(new Set());
      setTimeout(() => setStatusMessage(null), 3200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "領域の更新に失敗しました";
      setErrorMessage(message);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds]);

  useEffect(() => {
    return () => {
      setSelectedIds(new Set());
    };
  }, []);

  return (
    <div className={containerClass}>
      <section className={canvasSectionClass}>
        <div>
          <h1 className={titleClass}>アノテーション (サーバー合成プレビュー)</h1>
          <p className={subtitleClass}>
            クリック位置をサーバーに送信し、内部マスクでヒットテストした結果のみを取得します。
            クライアントは ID と合成済みプレビュー画像だけを扱い、ポリゴン座標は保持しません。
          </p>
        </div>

        <div
          ref={wrapperRef}
          className={imageWrapperClass}
          role="presentation"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handleCanvasClick}
        >
          <img src={IMAGE_PATH} alt="annotation sample" className={baseImageClass} />
          <div
            className={cursorRingClass}
            style={{
              transform: `translate(${cursorPosition.x}px, ${cursorPosition.y}px) scale(${cursorPosition.visible ? 1 : 0.6})`,
              opacity: cursorPosition.visible ? 1 : 0,
            }}
          />
        </div>

        {errorMessage ? <div className={errorBannerClass}>{errorMessage}</div> : null}
        {statusMessage ? <div className={statusBannerClass}>{statusMessage}</div> : null}

        <p className={helperTextClass}>
          クリックのみでサーバーに判定を委譲し、UIにはマスク実体を保持しません。処理状況はステータスに表示されます。
        </p>
      </section>

      <aside className={sidePanelClass}>
        <div>
          <h2 className={titleClass}>プレビュー / 操作</h2>
          <p className={helperTextClass}>
            ヒットした領域は下記の ROI プレビューにハイライトされます。無効化操作はモックです。
          </p>
        </div>

        {roiImage ? (
          <img src={roiImage} alt="ROI preview" className={roiImageClass} />
        ) : (
          <div className={helperTextClass}>ROI プレビューはまだありません。</div>
        )}

        <div>
          <h3 className={subtitleClass}>選択中の領域</h3>
          {selectedList.length > 0 ? (
            <div className={selectionListClass}>
              {selectedList.map((id) => (
                <span key={id}>{id}</span>
              ))}
            </div>
          ) : (
            <div className={helperTextClass}>選択中の領域はありません。</div>
          )}
        </div>

        <Button
          type="button"
          variant="solid"
          disabled={isProcessing || selectedList.length === 0}
          onClick={handleDisableSelected}
        >
          選択領域を無効化 (モック)
        </Button>
        <Button type="button" variant="ghost" disabled={isProcessing} onClick={handleClearSelection}>
          選択をクリア
        </Button>
      </aside>
    </div>
  );
}
