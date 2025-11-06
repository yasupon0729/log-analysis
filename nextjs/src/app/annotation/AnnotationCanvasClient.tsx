"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { css } from "@/styled-system/css";

const CANVAS_WIDTH = 1049;
const CANVAS_HEIGHT = 695;
const IMAGE_PATH = "/annotation-sample.png";

interface RawAnnotationPoint {
  x: number;
  y: number;
}

interface RawAnnotationBoundary {
  polygon: { vertices: RawAnnotationPoint[] };
  bbox: [number, number, number, number];
  score: number;
  iou: number;
}

interface RawAnnotationResponse {
  ok: boolean;
  annotation?: {
    boundaries: RawAnnotationBoundary[];
  };
  error?: string;
}

interface AnnotationRegion {
  id: string;
  label: string;
  score: number;
  iou: number;
  points: RawAnnotationPoint[];
  bbox: [number, number, number, number];
}

interface RegionRenderData extends AnnotationRegion {
  path: Path2D;
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

const queuePanelClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  borderWidth: "1px",
  borderColor: "gray.200",
  borderRadius: "16px",
  backgroundColor: "white",
  padding: { base: "20px", md: "24px" },
  boxShadow: "lg",
});

const queueTitleClass = css({
  fontSize: "lg",
  fontWeight: "semibold",
});

const queueListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  maxHeight: "480px",
  overflowY: "auto",
});

const queueItemClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  borderWidth: "1px",
  borderColor: "red.200",
  backgroundColor: "red.50",
  padding: "12px",
  borderRadius: "12px",
});

const queueMetaClass = css({
  fontSize: "xs",
  color: "gray.600",
});

const helperTextClass = css({
  fontSize: "sm",
  color: "gray.600",
  lineHeight: "1.6",
});

const statusBannerClass = css({
  fontSize: "sm",
  borderRadius: "10px",
  padding: "10px 12px",
  backgroundColor: "green.50",
  color: "green.700",
  borderWidth: "1px",
  borderColor: "green.200",
});

const errorBannerClass = css({
  fontSize: "sm",
  borderRadius: "10px",
  padding: "10px 12px",
  backgroundColor: "red.50",
  color: "red.700",
  borderWidth: "1px",
  borderColor: "red.200",
});

const footnoteClass = css({
  fontSize: "xs",
  color: "gray.500",
});

export function AnnotationCanvasClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const regionSourceRef = useRef<AnnotationRegion[]>([]);
  const regionDataRef = useRef<RegionRenderData[]>([]);

  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);
  const [removalQueue, setRemovalQueue] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImageReady, setIsImageReady] = useState(false);
  const [regionVersion, setRegionVersion] = useState(0);
  const [isFetching, setIsFetching] = useState(true);

  const hoveredRegion = useMemo(() => {
    return (
      regionDataRef.current.find((region) => region.id === hoveredRegionId) ??
      null
    );
  }, [hoveredRegionId]);

  const queueRegions = useMemo(() => {
    if (!regionDataRef.current.length || removalQueue.length === 0) {
      return [] as RegionRenderData[];
    }
    const queueSet = new Set(removalQueue);
    return regionDataRef.current.filter((region) => queueSet.has(region.id));
  }, [removalQueue]);

  const buildRegionPaths = useCallback(() => {
    regionDataRef.current = regionSourceRef.current.map((region) => {
      const path = new Path2D();
      region.points.forEach((point, index) => {
        if (index === 0) {
          path.moveTo(point.x, point.y);
        } else {
          path.lineTo(point.x, point.y);
        }
      });
      path.closePath();
      return { ...region, path };
    });
  }, []);

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

    for (const region of regionDataRef.current) {
      const isHovered = region.id === hoveredRegionId;
      const isQueued = queueSet.has(region.id);
      const fill = isQueued
        ? isHovered
          ? "rgba(220, 38, 38, 0.55)"
          : "rgba(248, 113, 113, 0.38)"
        : isHovered
          ? "rgba(96, 165, 250, 0.55)"
          : "rgba(37, 99, 235, 0.22)";
      const stroke = isQueued
        ? isHovered
          ? "#b91c1c"
          : "#dc2626"
        : isHovered
          ? "#3b82f6"
          : "#2563eb";

      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isHovered ? 2.4 : 1.6;
      ctx.fill(region.path);
      ctx.stroke(region.path);
      ctx.restore();
    }
  }, [hoveredRegionId, removalQueue]);

  const findRegionAtPoint = useCallback((x: number, y: number) => {
    const ctx = contextRef.current;
    if (!ctx) {
      return null;
    }
    for (const region of regionDataRef.current) {
      if (ctx.isPointInPath(region.path, x, y)) {
        return region;
      }
    }
    return null;
  }, []);

  const toggleRemovalQueue = useCallback((regionId: string) => {
    setRemovalQueue((current) => {
      const exists = current.includes(regionId);
      if (exists) {
        return current.filter((id) => id !== regionId);
      }
      return [...current, regionId];
    });
  }, []);

  const handleCanvasPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>, triggerToggle = false) => {
      const canvas = canvasRef.current;
      if (!canvas || regionDataRef.current.length === 0) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;

      const region = findRegionAtPoint(x, y);

      setHoveredRegionId(region?.id ?? null);

      if (triggerToggle && region) {
        toggleRemovalQueue(region.id);
      }
    },
    [findRegionAtPoint, toggleRemovalQueue],
  );

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

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const fetchAnnotation = async () => {
      setIsFetching(true);
      setErrorMessage(null);
      try {
        const response = await fetch("/api/annotation", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`annotation fetch failed: ${response.status}`);
        }

        const payload = (await response.json()) as RawAnnotationResponse;
        if (!payload.ok || !payload.annotation?.boundaries) {
          throw new Error(payload.error ?? "annotation data is invalid");
        }

        const mappedRegions: AnnotationRegion[] =
          payload.annotation.boundaries.map((boundary, index) => ({
            id: `region-${index + 1}`,
            label: `領域 ${index + 1}`,
            score: boundary.score,
            iou: boundary.iou,
            points: boundary.polygon.vertices.map((vertex) => ({ ...vertex })),
            bbox: boundary.bbox,
          }));

        if (isMounted) {
          regionSourceRef.current = mappedRegions;
          setRegionVersion((version) => version + 1);
        }
      } catch (fetchError) {
        if (!isMounted || controller.signal.aborted) {
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

    void fetchAnnotation();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const image = new Image();
    image.src = IMAGE_PATH;
    image.onload = () => {
      imageRef.current = image;
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) {
        setErrorMessage("キャンバスの初期化に失敗しました");
        return;
      }
      contextRef.current = context;
      setIsImageReady(true);
    };

    image.onerror = () => {
      setErrorMessage("サンプル画像の読み込みに失敗しました");
    };
  }, []);

  useEffect(() => {
    if (!isImageReady || regionVersion === 0) {
      return;
    }
    buildRegionPaths();
    drawScene();
  }, [isImageReady, regionVersion, buildRegionPaths, drawScene]);

  useEffect(() => {
    if (!isImageReady || regionDataRef.current.length === 0) {
      return;
    }
    drawScene();
  }, [drawScene, isImageReady]);

  return (
    <div className={containerClass}>
      <section className={canvasSectionClass}>
        <div className={headingClass}>
          <h1 className={titleClass}>誤認識除去モックキャンバス</h1>
          <p className={subtitleClass}>
            Mask R-CNN
            推論結果をレイヤー化し、ホバーで領域を追跡しながら、クリックで
            誤認識除去キューに追加できるインタラクションを Next.js
            単体で再現します。
          </p>
        </div>

        <div className={canvasWrapperClass}>
          <canvas
            ref={canvasRef}
            className={canvasClass}
            onPointerMove={(event) => handleCanvasPointer(event, false)}
            onPointerLeave={() => setHoveredRegionId(null)}
            onPointerDown={(event) => handleCanvasPointer(event, true)}
            aria-label="Mask R-CNN アノテーションキャンバス"
          />

          {isFetching ? (
            <div className={loadingOverlayClass}>座標情報を取得しています…</div>
          ) : null}

          {hoveredRegion ? (
            <div className={overlayBadgeClass}>
              <span>{hoveredRegion.label}</span>
              <span>{`score: ${hoveredRegion.score.toFixed(3)} / IoU: ${hoveredRegion.iou.toFixed(3)}`}</span>
              <span>{`頂点数: ${hoveredRegion.points.length}`}</span>
              <span>{`bbox: [${hoveredRegion.bbox.join(", ")}]`}</span>
            </div>
          ) : null}
        </div>

        {errorMessage ? (
          <div className={errorBannerClass}>{errorMessage}</div>
        ) : null}

        <p className={helperTextClass}>
          ホバーで領域を確認できます。クリックすると誤認識除去キューに追加 /
          解除します。
          領域は赤で塗り分けされ、保存操作の雰囲気を再現しています。
        </p>
        <p className={footnoteClass}>
          ※ 座標 JSON
          はサーバー側で保護され、ページアクセス時に発行されるトークンを通じて取得しています。
        </p>
      </section>

      <aside className={queuePanelClass}>
        <div>
          <h2 className={queueTitleClass}>誤認識除去キュー</h2>
          <p className={helperTextClass}>
            座標 JSON の一時更新 /
            保存ボタン操作を模擬し、ブラウザ側にキューとして保持します。
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
                <div
                  className={queueMetaClass}
                >{`bbox: [${region.bbox.join(", ")}]`}</div>
                <div
                  className={queueMetaClass}
                >{`頂点数: ${region.points.length}`}</div>
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
