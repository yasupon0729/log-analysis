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

type SelectionMode = "click" | "range";

interface RangeSelection {
  start: RawAnnotationPoint;
  end: RawAnnotationPoint;
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
  gap: "20px",
  borderWidth: "1px",
  borderColor: "rgba(59, 130, 246, 0.35)",
  borderRadius: "20px",
  backgroundColor: "rgba(7, 13, 23, 0.95)",
  padding: { base: "22px", md: "26px" },
  boxShadow: "0 28px 60px rgba(2, 6, 23, 0.65)",
  color: "gray.100",
  backdropFilter: "blur(8px)",
});

const queueTitleClass = css({
  fontSize: "lg",
  fontWeight: "semibold",
  color: "white",
  letterSpacing: "0.04em",
});

const queueListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  maxHeight: "480px",
  overflowY: "auto",
  paddingRight: "4px",
});

const queueItemClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  borderWidth: "1px",
  borderColor: "rgba(248, 113, 113, 0.45)",
  backgroundColor: "rgba(248, 113, 113, 0.12)",
  padding: "12px",
  borderRadius: "12px",
  color: "gray.100",
  boxShadow: "0 16px 32px rgba(8, 15, 31, 0.55)",
});

const queueMetaClass = css({
  fontSize: "xs",
  color: "rgba(226, 232, 240, 0.85)",
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
  backgroundColor: "rgba(16, 185, 129, 0.14)",
  color: "rgba(187, 247, 208, 0.95)",
  borderWidth: "1px",
  borderColor: "rgba(74, 222, 128, 0.35)",
  boxShadow: "0 18px 36px rgba(16, 185, 129, 0.25)",
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

const selectionControlsClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
});

const selectionButtonsClass = css({
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
});

const selectionLabelClass = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "gray.700",
});

const selectionHintClass = css({
  fontSize: "xs",
  color: "gray.500",
  lineHeight: "1.4",
});

const selectionButtonClass = css({
  borderWidth: "1px",
  borderColor: "gray.400",
  backgroundColor: "rgba(30, 41, 59, 0.08)",
  color: "gray.700",
  fontWeight: "medium",
  transition: "all 0.15s ease",
  _hover: {
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    color: "gray.900",
  },
  _active: {
    backgroundColor: "rgba(37, 99, 235, 0.18)",
  },
  "&[data-selected='true']": {
    backgroundColor: "primary.600",
    color: "white",
    borderColor: "primary.500",
    boxShadow: "0 8px 20px rgba(37, 99, 235, 0.25)",
  },
});

const queueActionButtonClass = css({
  borderColor: "rgba(248, 113, 113, 0.9)",
  color: "white",
  backgroundColor: "rgba(248, 113, 113, 0.95)",
  fontWeight: "semibold",
  boxShadow: "0 10px 26px rgba(248, 113, 113, 0.35)",
  _hover: {
    backgroundColor: "rgba(248, 113, 113, 1)",
    borderColor: "rgba(248, 113, 113, 1)",
  },
  _active: {
    backgroundColor: "rgba(239, 68, 68, 0.95)",
    borderColor: "rgba(239, 68, 68, 0.95)",
  },
});

const queueDescriptionClass = css({
  fontSize: "sm",
  color: "rgba(226, 232, 240, 0.9)",
  lineHeight: "1.7",
});

const queueEmptyTextClass = css({
  fontSize: "sm",
  color: "rgba(148, 163, 184, 0.92)",
  lineHeight: "1.7",
  fontStyle: "italic",
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
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("click");

  const rangeSelectionRef = useRef<RangeSelection | null>(null);
  const isRangeSelectingRef = useRef(false);

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

  const getCanvasPoint = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      return { x, y };
    },
    [],
  );

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
          ? "rgba(220, 38, 38, 0.45)"
          : "rgba(248, 113, 113, 0.35)"
        : isHovered
          ? "rgba(37, 99, 235, 0.40)"
          : "rgba(37, 99, 235, 0.18)";
      const stroke = isQueued ? "#dc2626" : isHovered ? "#1d4ed8" : "#2563eb";

      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isHovered ? 2.4 : 1.6;
      ctx.fill(region.path);
      ctx.stroke(region.path);
      ctx.restore();
    }

    const selection = rangeSelectionRef.current;
    if (selection) {
      const minX = Math.min(selection.start.x, selection.end.x);
      const maxX = Math.max(selection.start.x, selection.end.x);
      const minY = Math.min(selection.start.y, selection.end.y);
      const maxY = Math.max(selection.start.y, selection.end.y);
      const width = maxX - minX;
      const height = maxY - minY;
      if (width > 2 && height > 2) {
        ctx.save();
        ctx.strokeStyle = "rgba(234, 88, 12, 0.9)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(minX, minY, width, height);
        ctx.fillStyle = "rgba(251, 146, 60, 0.12)";
        ctx.fillRect(minX, minY, width, height);
        ctx.restore();
      }
    }
  }, [hoveredRegionId, removalQueue]);

  const renderScene = useCallback(() => {
    if (!isImageReady || regionDataRef.current.length === 0) {
      return;
    }
    drawScene();
  }, [drawScene, isImageReady]);

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

  const selectRegionsWithinBounds = useCallback((selection: RangeSelection) => {
    const minX = Math.min(selection.start.x, selection.end.x);
    const maxX = Math.max(selection.start.x, selection.end.x);
    const minY = Math.min(selection.start.y, selection.end.y);
    const maxY = Math.max(selection.start.y, selection.end.y);
    const width = maxX - minX;
    const height = maxY - minY;
    if (width < 2 || height < 2) {
      return 0;
    }
    const containedRegions = regionDataRef.current.filter((region) =>
      region.points.every(
        (point) =>
          point.x >= minX &&
          point.x <= maxX &&
          point.y >= minY &&
          point.y <= maxY,
      ),
    );
    if (containedRegions.length === 0) {
      setStatusMessage("範囲内に領域はありませんでした。");
      setTimeout(() => setStatusMessage(null), 3200);
      return 0;
    }
    const tally = { added: 0, removed: 0 };
    setRemovalQueue((current) => {
      const queue = new Set(current);
      for (const region of containedRegions) {
        if (queue.has(region.id)) {
          queue.delete(region.id);
          tally.removed += 1;
        } else {
          queue.add(region.id);
          tally.added += 1;
        }
      }
      if (tally.added === 0 && tally.removed === 0) {
        return current;
      }
      return Array.from(queue);
    });
    const parts: string[] = [];
    if (tally.added > 0) {
      parts.push(`${tally.added} 件追加`);
    }
    if (tally.removed > 0) {
      parts.push(`${tally.removed} 件解除`);
    }
    const status =
      parts.length > 0
        ? `範囲選択: ${parts.join(" / ")}`
        : "範囲内の領域は既に現在の選択と一致しています。";
    setStatusMessage(status);
    setTimeout(() => setStatusMessage(null), 3200);
    return tally.added + tally.removed;
  }, []);

  const cancelRangeSelection = useCallback(
    (pointerId?: number) => {
      if (!rangeSelectionRef.current && !isRangeSelectingRef.current) {
        return;
      }
      if (typeof pointerId === "number") {
        const canvas = canvasRef.current;
        if (canvas) {
          try {
            canvas.releasePointerCapture(pointerId);
          } catch {
            // noop
          }
        }
      }
      rangeSelectionRef.current = null;
      isRangeSelectingRef.current = false;
      renderScene();
    },
    [renderScene],
  );

  const handleCanvasPointer = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>, triggerToggle = false) => {
      const point = getCanvasPoint(event);
      if (!point) {
        setHoveredRegionId(null);
        return;
      }
      if (regionDataRef.current.length === 0) {
        setHoveredRegionId(null);
        return;
      }

      const region = findRegionAtPoint(point.x, point.y);
      setHoveredRegionId(region?.id ?? null);

      if (selectionMode === "click" && triggerToggle && region) {
        toggleRemovalQueue(region.id);
      }
    },
    [findRegionAtPoint, getCanvasPoint, selectionMode, toggleRemovalQueue],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      handleCanvasPointer(event, false);
      if (
        selectionMode === "range" &&
        isRangeSelectingRef.current &&
        rangeSelectionRef.current
      ) {
        const point = getCanvasPoint(event);
        if (point) {
          rangeSelectionRef.current = {
            ...rangeSelectionRef.current,
            end: point,
          };
          renderScene();
        }
      }
    },
    [getCanvasPoint, handleCanvasPointer, renderScene, selectionMode],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (selectionMode === "range") {
        const point = getCanvasPoint(event);
        if (!point) {
          return;
        }
        rangeSelectionRef.current = { start: point, end: point };
        isRangeSelectingRef.current = true;
        const canvas = canvasRef.current;
        if (canvas) {
          try {
            canvas.setPointerCapture(event.pointerId);
          } catch {
            // noop
          }
        }
        renderScene();
        return;
      }
      handleCanvasPointer(event, true);
    },
    [getCanvasPoint, handleCanvasPointer, renderScene, selectionMode],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (selectionMode !== "range" || !rangeSelectionRef.current) {
        return;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          // noop
        }
      }
      const selection = rangeSelectionRef.current;
      rangeSelectionRef.current = null;
      isRangeSelectingRef.current = false;
      const width = Math.abs(selection.end.x - selection.start.x);
      const height = Math.abs(selection.end.y - selection.start.y);
      if (width < 2 || height < 2) {
        renderScene();
        return;
      }
      selectRegionsWithinBounds(selection);
      renderScene();
    },
    [renderScene, selectRegionsWithinBounds, selectionMode],
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      setHoveredRegionId(null);
      if (selectionMode === "range") {
        cancelRangeSelection(event.pointerId);
      }
    },
    [cancelRangeSelection, selectionMode],
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
    if (selectionMode === "click") {
      cancelRangeSelection();
    }
  }, [cancelRangeSelection, selectionMode]);

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
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
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
          ホバーで領域を確認できます。クリック選択 (Layer2)
          では個別に誤認識除去キューへ追加 / 解除します。範囲選択 (Layer3)
          を有効にすると、ドラッグした矩形に完全に含まれる領域を一括で追加 /
          解除できます。
          領域は赤で塗り分けされ、保存操作の雰囲気を再現しています。
        </p>
        <div className={selectionControlsClass}>
          <span className={selectionLabelClass}>選択モード</span>
          <div className={selectionButtonsClass} role="radiogroup" aria-label="選択モード">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={selectionButtonClass}
              data-selected={selectionMode === "click" ? "true" : "false"}
              aria-pressed={selectionMode === "click"}
              onClick={() => setSelectionMode("click")}
            >
              クリック選択 (Layer2)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={selectionButtonClass}
              data-selected={selectionMode === "range" ? "true" : "false"}
              aria-pressed={selectionMode === "range"}
              onClick={() => setSelectionMode("range")}
            >
              範囲選択 (Layer3)
            </Button>
          </div>
          <p className={selectionHintClass}>
            範囲選択では Canvas
            に矩形をドラッグし、その範囲に完全に含まれる領域を一括で追加 / 解除します。
          </p>
        </div>
        <p className={footnoteClass}>
          ※ 座標 JSON
          はサーバー側で保護され、ページアクセス時に発行されるトークンを通じて取得しています。
        </p>
      </section>

      <aside className={queuePanelClass}>
        <div>
          <h2 className={queueTitleClass}>誤認識除去キュー</h2>
          <p className={queueDescriptionClass}>
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
                  className={queueActionButtonClass}
                  onClick={() => toggleRemovalQueue(region.id)}
                >
                  キューから除外
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className={queueEmptyTextClass}>
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
