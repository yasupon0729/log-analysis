"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { css } from "@/styled-system/css";

const CANVAS_WIDTH = 1049;
const CANVAS_HEIGHT = 695;
const IMAGE_PATH = "/annotation-sample.png";
const IMAGE_ID = "annotation-sample";

interface MetadataResponse {
  ok: boolean;
  regions?: Array<{
    id: string;
    label: string;
    bbox: [number, number, number, number];
    score: number;
    iou: number;
  }>;
  error?: string;
}

interface HitResponse {
  ok: boolean;
  hoverId: string | null;
  overlayImage: string;
  region: {
    id: string;
    label: string;
    score: number;
    iou: number;
  } | null;
  error?: string;
}

interface OverlayResponse {
  ok: boolean;
  overlayImage: string;
  error?: string;
}

interface UpdateResponse {
  ok: boolean;
  disabledIds?: string[];
  error?: string;
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

const canvasWrapperClass = css({
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
  userSelect: "none",
});

const overlayImageClass = css({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  pointerEvents: "none",
});

const cursorRingClass = css({
  position: "absolute",
  width: "28px",
  height: "28px",
  marginLeft: "-14px",
  marginTop: "-14px",
  borderRadius: "9999px",
  borderWidth: "2px",
  borderColor: "rgba(59, 130, 246, 0.7)",
  backgroundColor: "rgba(59, 130, 246, 0.22)",
  pointerEvents: "none",
  transition: "transform 120ms ease, opacity 160ms ease",
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

const selectionListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  fontSize: "sm",
  color: "gray.700",
});

const metaListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  fontSize: "xs",
  color: "gray.500",
});

const roiImageClass = css({
  width: "100%",
  borderRadius: "12px",
  borderWidth: "1px",
  borderColor: "rgba(59, 130, 246, 0.35)",
  backgroundColor: "rgba(30, 41, 59, 0.12)",
});

interface RegionMeta {
  id: string;
  label: string;
  bbox: [number, number, number, number];
  score: number;
  iou: number;
}

const initialCursor = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, visible: false };

export function AnnotationCanvas4Client() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hitAbortRef = useRef<AbortController | null>(null);
  const pointerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const interactiveOverlaySeqRef = useRef(0);
  const baseOverlaySeqRef = useRef(0);

  const [metadata, setMetadata] = useState<RegionMeta[]>([]);
  const [baseOverlayImage, setBaseOverlayImage] = useState<string | null>(null);
  const [overlayImage, setOverlayImage] = useState<string | null>(null);
  const [cursor, setCursor] = useState(initialCursor);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [queueIds, setQueueIds] = useState<Set<string>>(new Set());
  const [highlightRegion, setHighlightRegion] = useState<RegionMeta | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedList = useMemo(() => Array.from(queueIds), [queueIds]);

  useEffect(() => {
    let active = true;
    const fetchMetadata = async () => {
      try {
        const response = await fetch("/api/annotation4/metadata", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`metadata fetch failed: ${response.status}`);
        }
        const payload = (await response.json()) as MetadataResponse;
        if (!payload.ok || !payload.regions) {
          throw new Error(payload.error ?? "metadata payload invalid");
        }
        if (active) {
          setMetadata(payload.regions);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "メタデータの取得に失敗しました";
        if (active) {
          setErrorMessage(message);
        }
      }
    };
    fetchMetadata();
    return () => {
      active = false;
    };
  }, []);

  const requestInteractiveOverlay = useCallback(
    async (queue: Set<string>, hover: string | null) => {
      const requestId = ++interactiveOverlaySeqRef.current;
      try {
        const response = await fetch("/api/annotation4/overlay", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queueIds: Array.from(queue), hoverId: hover, includeOutline: false }),
        });
        if (!response.ok) {
          throw new Error(`overlay request failed: ${response.status}`);
        }
        const payload = (await response.json()) as OverlayResponse;
        if (!payload.ok) {
          throw new Error(payload.error ?? "overlay payload invalid");
        }
        if (requestId === interactiveOverlaySeqRef.current) {
          setOverlayImage(payload.overlayImage);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "オーバーレイの取得に失敗しました";
        if (requestId === interactiveOverlaySeqRef.current) {
          setErrorMessage(message);
        }
      }
    },
    [],
  );

  const requestBaseOverlay = useCallback(async () => {
    const requestId = ++baseOverlaySeqRef.current;
    try {
      const response = await fetch("/api/annotation4/overlay", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueIds: [], hoverId: null, includeOutline: true }),
      });
      if (!response.ok) {
        throw new Error(`overlay request failed: ${response.status}`);
      }
      const payload = (await response.json()) as OverlayResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "overlay payload invalid");
      }
      if (requestId === baseOverlaySeqRef.current) {
        setBaseOverlayImage(payload.overlayImage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "輪郭タイルの取得に失敗しました";
      if (requestId === baseOverlaySeqRef.current) {
        setErrorMessage(message);
      }
    }
  }, []);

  const refreshInteractiveOverlay = useCallback(
    (queue: Set<string>, hover: string | null) => {
      void requestInteractiveOverlay(queue, hover);
    },
    [requestInteractiveOverlay],
  );

  const refreshBaseOverlay = useCallback(() => {
    void requestBaseOverlay();
  }, [requestBaseOverlay]);

  const findRegionMeta = useCallback(
    (id: string): RegionMeta | null => metadata.find((region) => region.id === id) ?? null,
    [metadata],
  );

  const scheduleHit = useCallback(
    (coords: { x: number; y: number }) => {
      lastPointerRef.current = coords;
      if (pointerTimeoutRef.current) {
        clearTimeout(pointerTimeoutRef.current);
      }
      pointerTimeoutRef.current = setTimeout(() => {
        void performHit(coords);
      }, 42);
    },
    [],
  );

  const performHit = useCallback(
    async (coords: { x: number; y: number }) => {
      if (hitAbortRef.current) {
        hitAbortRef.current.abort();
      }
      const controller = new AbortController();
      hitAbortRef.current = controller;
      const requestId = ++interactiveOverlaySeqRef.current;

      try {
        const response = await fetch("/api/annotation4/hit", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageId: IMAGE_ID,
            x: coords.x,
            y: coords.y,
            queueIds: Array.from(queueIds),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`hit request failed: ${response.status}`);
        }

        const payload = (await response.json()) as HitResponse;
        if (!payload.ok) {
          throw new Error(payload.error ?? "hit payload invalid");
        }

        if (requestId === interactiveOverlaySeqRef.current) {
          setOverlayImage(payload.overlayImage);
          setHoveredId(payload.hoverId);
          setHighlightRegion(payload.region ? findRegionMeta(payload.region.id) : null);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : "ヒットテストに失敗しました";
        if (requestId === interactiveOverlaySeqRef.current) {
          setErrorMessage(message);
        }
      }
    },
    [queueIds, findRegionMeta],
  );

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
      setCursor({ x: coords.x, y: coords.y, visible: true });
      scheduleHit(coords);
    },
    [scheduleHit, translatePointerToImageCoords],
  );

  const handlePointerLeave = useCallback(() => {
    setCursor((prev) => ({ ...prev, visible: false }));
    setHoveredId(null);
    setHighlightRegion(null);
    void refreshInteractiveOverlay(new Set(queueIds), null);
  }, [queueIds, refreshInteractiveOverlay]);

  const handleCanvasClick = useCallback(
    async (event: ReactPointerEvent<HTMLDivElement>) => {
      const coords = translatePointerToImageCoords(event);
      if (!coords) {
        return;
      }

      if (pointerTimeoutRef.current) {
        clearTimeout(pointerTimeoutRef.current);
        pointerTimeoutRef.current = null;
      }
      await performHit(coords);

      if (!hoveredId) {
        setStatusMessage("該当する領域がありません。");
        setTimeout(() => setStatusMessage(null), 2400);
        return;
      }

      setQueueIds((current) => {
        const next = new Set(current);
        if (next.has(hoveredId)) {
          next.delete(hoveredId);
          setStatusMessage(`${hoveredId} をキューから除外しました。`);
        } else {
          next.add(hoveredId);
          setStatusMessage(`${hoveredId} をキューに追加しました。`);
        }
        setTimeout(() => setStatusMessage(null), 2400);
        void refreshInteractiveOverlay(new Set(next), hoveredId);
        return next;
      });
    },
    [hoveredId, performHit, translatePointerToImageCoords, refreshInteractiveOverlay],
  );

  const handleClearQueue = useCallback(() => {
    setQueueIds(new Set());
    void refreshInteractiveOverlay(new Set(), hoveredId);
  }, [hoveredId, refreshInteractiveOverlay]);

  const handleDisableSelected = useCallback(async () => {
    if (queueIds.size === 0) {
      setStatusMessage("キューに領域がありません。");
      setTimeout(() => setStatusMessage(null), 2000);
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);
    const ids = Array.from(queueIds);
    try {
      const response = await fetch("/api/annotation4/instances", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, disabled: true }),
      });
      if (!response.ok) {
        throw new Error(`disable request failed: ${response.status}`);
      }
      const payload = (await response.json()) as UpdateResponse;
      if (!payload.ok) {
        throw new Error(payload.error ?? "領域の更新に失敗しました");
      }
      setStatusMessage(`${ids.length} 件の領域を無効化しました (モック)。`);
      setQueueIds(new Set());
      void refreshBaseOverlay();
      void refreshInteractiveOverlay(new Set(), hoveredId);
      setTimeout(() => setStatusMessage(null), 3200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "領域の更新に失敗しました";
      setErrorMessage(message);
    } finally {
      setIsProcessing(false);
    }
  }, [hoveredId, queueIds, refreshBaseOverlay, refreshInteractiveOverlay]);

  useEffect(() => {
    return () => {
      if (pointerTimeoutRef.current) {
        clearTimeout(pointerTimeoutRef.current);
      }
      if (hitAbortRef.current) {
        hitAbortRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    refreshBaseOverlay();
  }, [refreshBaseOverlay]);

  const hoveredMeta = useMemo(() => {
    if (!hoveredId) {
      return null;
    }
    return findRegionMeta(hoveredId);
  }, [findRegionMeta, hoveredId]);

  return (
    <div className={containerClass}>
      <section className={canvasSectionClass}>
        <div>
          <h1 className={titleClass}>アノテーション (ポリゴン合成保護版)</h1>
          <p className={subtitleClass}>
            サーバー側でマスクを保持し、ヒットテストと輪郭合成を行います。クライアントは輪郭タイル画像のみを扱い、ポリゴン座標は保持しません。
          </p>
        </div>

        <div
          ref={wrapperRef}
          className={canvasWrapperClass}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onPointerDown={handleCanvasClick}
          role="presentation"
        >
          <img src={IMAGE_PATH} alt="annotation sample" className={baseImageClass} draggable={false} />
          {baseOverlayImage ? (
            <img src={baseOverlayImage} alt="annotation outline" className={overlayImageClass} draggable={false} />
          ) : null}
          {overlayImage ? (
            <img src={overlayImage} alt="annotation overlay" className={overlayImageClass} draggable={false} />
          ) : null}
          <div
            className={cursorRingClass}
            style={{
              transform: `translate(${cursor.x}px, ${cursor.y}px)` ,
              opacity: cursor.visible ? 1 : 0,
            }}
          />
        </div>

        {hoveredMeta ? (
          <div className={metaListClass}>
            <span>{hoveredMeta.label}</span>
            <span>{`score: ${hoveredMeta.score.toFixed(3)} / IoU: ${hoveredMeta.iou.toFixed(3)}`}</span>
            <span>{`bbox: [${hoveredMeta.bbox.join(", ")}]`}</span>
          </div>
        ) : null}

        {errorMessage ? <div className={errorBannerClass}>{errorMessage}</div> : null}
        {statusMessage ? <div className={statusBannerClass}>{statusMessage}</div> : null}

        <p className={helperTextClass}>
          ポリゴン輪郭の描画はサーバー側で行い、描画結果のみがクライアントに渡されます。クリックで誤認識除去キューに追加 / 除外できます。
        </p>
      </section>

      <aside className={sidePanelClass}>
        <div>
          <h2 className={titleClass}>誤認識除去キュー</h2>
          <p className={helperTextClass}>
            選択された領域は下記リストに追加されます。操作はモック処理であり、無効化結果はサーバー状態に保持されます。
          </p>
        </div>

        {selectedList.length > 0 ? (
          <div className={selectionListClass}>
            {selectedList.map((id) => (
              <span key={id}>{id}</span>
            ))}
          </div>
        ) : (
          <div className={helperTextClass}>まだ選択された領域はありません。</div>
        )}

        {highlightRegion ? (
          <div className={metaListClass}>
            <span>{highlightRegion.label}</span>
            <span>{`score: ${highlightRegion.score.toFixed(3)} / IoU: ${highlightRegion.iou.toFixed(3)}`}</span>
          </div>
        ) : (
          <div className={helperTextClass}>最新のヒット情報はありません。</div>
        )}

        <Button
          type="button"
          variant="solid"
          disabled={isProcessing || selectedList.length === 0}
          onClick={handleDisableSelected}
        >
          選択領域を無効化 (モック)
        </Button>
        <Button type="button" variant="ghost" disabled={isProcessing} onClick={handleClearQueue}>
          選択をクリア
        </Button>

        {highlightRegion ? (
          <img src={overlayImage ?? undefined} alt="最新のオーバーレイ" className={roiImageClass} />
        ) : null}
      </aside>
    </div>
  );
}
