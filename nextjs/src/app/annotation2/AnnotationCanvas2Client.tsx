"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { css } from "@/styled-system/css";

const CANVAS_WIDTH = 1049;
const CANVAS_HEIGHT = 695;
const IMAGE_PATH = "/annotation-sample.png";

interface AnnotationRegionMeta {
  id: string;
  label: string;
  bbox: [number, number, number, number];
  score: number;
  iou: number;
}

interface MetadataResponse {
  ok: boolean;
  regions?: AnnotationRegionMeta[];
  error?: string;
}

interface HitTestResponse {
  ok: boolean;
  region: AnnotationRegionMeta | null;
  error?: string;
}

type HitTestIntent = "hover" | "click";

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

const headingClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
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

const canvasClass = css({
  width: "100%",
  height: "100%",
  display: "block",
  cursor: "crosshair",
});

const overlayBadgeClass = css({
  position: "absolute",
  left: "16px",
  top: "16px",
  backgroundColor: "rgba(15, 23, 42, 0.75)",
  color: "white",
  padding: "10px 14px",
  borderRadius: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  fontSize: "sm",
  pointerEvents: "none",
  minWidth: "220px",
});

const loadingOverlayClass = css({
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(15, 23, 42, 0.4)",
  color: "white",
  fontSize: "sm",
});

const errorBannerClass = css({
  padding: "12px 16px",
  borderRadius: "12px",
  backgroundColor: "rgba(220, 38, 38, 0.12)",
  color: "rgb(153, 27, 27)",
  fontSize: "sm",
});

const helperTextClass = css({
  color: "gray.600",
  fontSize: { base: "sm", md: "md" },
});

const footnoteClass = css({
  color: "gray.500",
  fontSize: "xs",
});

const queuePanelClass = css({
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

const queueTitleClass = css({
  fontSize: { base: "lg", md: "xl" },
  fontWeight: "semibold",
});

const statusBannerClass = css({
  padding: "12px 16px",
  borderRadius: "12px",
  backgroundColor: "rgba(37, 99, 235, 0.12)",
  color: "rgb(37, 99, 235)",
  fontSize: "sm",
});

const queueListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
});

const queueItemClass = css({
  borderWidth: "1px",
  borderColor: "gray.200",
  borderRadius: "12px",
  padding: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
});

const queueMetaClass = css({
  color: "gray.600",
  fontSize: "sm",
});

export function AnnotationCanvas2Client() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const hitTestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hitTestAbortRef = useRef<AbortController | null>(null);
  const latestCoordsRef = useRef<{ x: number; y: number } | null>(null);

  const [regions, setRegions] = useState<AnnotationRegionMeta[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [removalQueue, setRemovalQueue] = useState<string[]>([]);
  const [isImageReady, setIsImageReady] = useState(false);

  const queueRegions = useMemo(() => {
    if (removalQueue.length === 0) {
      return [] as AnnotationRegionMeta[];
    }
    const regionMap = new Map(regions.map((region) => [region.id, region]));
    return removalQueue
      .map((id) => regionMap.get(id))
      .filter((region): region is AnnotationRegionMeta => Boolean(region));
  }, [regions, removalQueue]);

  const hoveredRegion = useMemo(
    () => regions.find((region) => region.id === hoveredRegionId) ?? null,
    [regions, hoveredRegionId],
  );

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    const image = imageRef.current;
    if (!canvas || !ctx || !image) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const queueSet = new Set(removalQueue);

    for (const region of regions) {
      const [x, y, width, height] = region.bbox;
      const isHovered = region.id === hoveredRegionId;
      const isQueued = queueSet.has(region.id);
      const fill = isQueued
        ? isHovered
          ? "rgba(220, 38, 38, 0.45)"
          : "rgba(248, 113, 113, 0.28)"
        : isHovered
          ? "rgba(59, 130, 246, 0.35)"
          : "rgba(59, 130, 246, 0.12)";
      const stroke = isQueued
        ? isHovered
          ? "#b91c1c"
          : "#dc2626"
        : isHovered
          ? "#2563eb"
          : "rgba(59, 130, 246, 0.55)";

      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isHovered ? 2.2 : 1.4;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    }
  }, [hoveredRegionId, regions, removalQueue]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) {
      setErrorMessage("Canvas の初期化に失敗しました");
      return;
    }
    contextRef.current = context;

    const image = new Image();
    image.src = IMAGE_PATH;
    image.onload = () => {
      imageRef.current = image;
      setIsImageReady(true);
      drawScene();
    };
    image.onerror = () => {
      setErrorMessage("サンプル画像の読み込みに失敗しました");
    };
  }, [drawScene]);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const fetchMetadata = async () => {
      setIsFetching(true);
      setErrorMessage(null);
      try {
        const response = await fetch("/api/annotation2/metadata", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`metadata fetch failed: ${response.status}`);
        }

        const payload = (await response.json()) as MetadataResponse;
        if (!payload.ok || !payload.regions) {
          throw new Error(payload.error ?? "metadata payload is invalid");
        }

        if (isMounted) {
          setRegions(payload.regions);
        }
      } catch (fetchError) {
        if (controller.signal.aborted || !isMounted) {
          return;
        }
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "アノテーション情報の取得に失敗しました";
        setErrorMessage(message);
      } finally {
        if (isMounted) {
          setIsFetching(false);
        }
      }
    };

    fetchMetadata();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!isImageReady) {
      return;
    }
    drawScene();
  }, [drawScene, isImageReady, regions]);

  const toggleRemovalQueue = useCallback((regionId: string) => {
    setRemovalQueue((current) => {
      const exists = current.includes(regionId);
      if (exists) {
        return current.filter((id) => id !== regionId);
      }
      return [...current, regionId];
    });
  }, []);

  const handleSimulateSave = useCallback(() => {
    if (removalQueue.length === 0) {
      setStatusMessage("保存対象が選択されていません。");
      return;
    }
    setStatusMessage(
      `${removalQueue.length} 件の領域を誤認識除去キューに送信しました (モック)。`,
    );
    setTimeout(() => setStatusMessage(null), 3200);
  }, [removalQueue]);

  const handleClearQueue = useCallback(() => {
    setRemovalQueue([]);
  }, []);

  const performHitTest = useCallback(
    async (coords: { x: number; y: number }, intent: HitTestIntent) => {
      if (hitTestAbortRef.current) {
        hitTestAbortRef.current.abort();
      }

      const controller = new AbortController();
      hitTestAbortRef.current = controller;

      try {
        const response = await fetch("/api/annotation2/hit-test", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(coords),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`hit-test failed: ${response.status}`);
        }

        const payload = (await response.json()) as HitTestResponse;
        if (!payload.ok) {
          throw new Error(payload.error ?? "hit-test response is invalid");
        }

        const regionId = payload.region?.id ?? null;
        setErrorMessage(null);
        if (intent === "hover") {
          setHoveredRegionId(regionId);
        } else if (intent === "click" && regionId) {
          toggleRemovalQueue(regionId);
          setHoveredRegionId(regionId);
        }
      } catch (hitTestError) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          hitTestError instanceof Error
            ? hitTestError.message
            : "ヒットテストに失敗しました";
        setErrorMessage(message);
      }
    },
    [toggleRemovalQueue],
  );

  const scheduleHitTest = useCallback(
    (intent: HitTestIntent) => {
      if (hitTestTimeoutRef.current) {
        clearTimeout(hitTestTimeoutRef.current);
      }
      const coords = latestCoordsRef.current;
      if (!coords) {
        return;
      }
      hitTestTimeoutRef.current = setTimeout(() => {
        hitTestTimeoutRef.current = null;
        void performHitTest(coords, intent);
      }, intent === "hover" ? 36 : 0);
    },
    [performHitTest],
  );

  const handleCanvasPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>, intent: HitTestIntent) => {
      const canvas = canvasRef.current;
      if (!canvas || regions.length === 0) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;

      latestCoordsRef.current = { x, y };
      scheduleHitTest(intent);
    },
    [regions.length, scheduleHitTest],
  );

  const handleCanvasLeave = useCallback(() => {
    latestCoordsRef.current = null;
    if (hitTestTimeoutRef.current) {
      clearTimeout(hitTestTimeoutRef.current);
      hitTestTimeoutRef.current = null;
    }
    if (hitTestAbortRef.current) {
      hitTestAbortRef.current.abort();
      hitTestAbortRef.current = null;
    }
    setHoveredRegionId(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hitTestTimeoutRef.current) {
        clearTimeout(hitTestTimeoutRef.current);
      }
      if (hitTestAbortRef.current) {
        hitTestAbortRef.current.abort();
      }
    };
  }, []);

  return (
    <div className={containerClass}>
      <section className={canvasSectionClass}>
        <div className={headingClass}>
          <h1 className={titleClass}>誤認識除去キャンバス (サーバーヒットテスト版)</h1>
          <p className={subtitleClass}>
            座標 JSON
            をブラウザに配布せず、Canvas の描画とクリック判定を分離したモックです。
            サーバー側でポリゴン判定を行い、クライアントは軽量メタデータのみを保持します。
          </p>
        </div>

        <div className={canvasWrapperClass}>
          <canvas
            ref={canvasRef}
            className={canvasClass}
            onPointerMove={(event) => handleCanvasPointer(event, "hover")}
            onPointerDown={(event) => handleCanvasPointer(event, "click")}
            onPointerLeave={handleCanvasLeave}
            aria-label="Mask R-CNN アノテーションキャンバス (サーバーヒットテスト)"
          />

          {isFetching ? (
            <div className={loadingOverlayClass}>座標メタデータを取得しています…</div>
          ) : null}

          {hoveredRegion ? (
            <div className={overlayBadgeClass}>
              <span>{hoveredRegion.label}</span>
              <span>{`score: ${hoveredRegion.score.toFixed(3)} / IoU: ${hoveredRegion.iou.toFixed(3)}`}</span>
              <span>{`bbox: [${hoveredRegion.bbox.join(", ")}]`}</span>
            </div>
          ) : null}
        </div>

        {errorMessage ? <div className={errorBannerClass}>{errorMessage}</div> : null}

        <p className={helperTextClass}>
          ホバーイベントはサーバーにヒットテストを行い、該当領域のみをハイライトします。
          クリックすると誤認識除去キューに追加 / 解除できます。
        </p>
        <p className={footnoteClass}>
          ※ クライアントはバウンディングボックスとスコアなどのメタ情報のみ保持し、ポリゴン座標は API
          側で扱います。
        </p>
      </section>

      <aside className={queuePanelClass}>
        <div>
          <h2 className={queueTitleClass}>誤認識除去キュー</h2>
          <p className={helperTextClass}>
            クライアントに露出しない判定フローを保ったまま、キュー操作を体験できます。
          </p>
        </div>

        {statusMessage ? (
          <div className={statusBannerClass}>{statusMessage}</div>
        ) : null}

        {queueRegions.length > 0 ? (
          <div className={queueListClass}>
            {queueRegions.map((region) => (
              <div key={region.id} className={queueItemClass}>
                <div>{region.label}</div>
                <div className={queueMetaClass}>
                  {`score: ${region.score.toFixed(3)} / IoU: ${region.iou.toFixed(3)}`}
                </div>
                <div className={queueMetaClass}>{`bbox: [${region.bbox.join(", ")}]`}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => toggleRemovalQueue(region.id)}
                >
                  キューから除外
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className={helperTextClass}>
            まだ誤認識除去キューに領域はありません。キャンバス上の領域をクリックして追加してください。
          </div>
        )}

        <Button
          type="button"
          variant="solid"
          onClick={handleSimulateSave}
          disabled={removalQueue.length === 0}
        >
          保存ボタン (モック)
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClearQueue}
          disabled={removalQueue.length === 0}
        >
          キューをクリア
        </Button>
      </aside>
    </div>
  );
}
