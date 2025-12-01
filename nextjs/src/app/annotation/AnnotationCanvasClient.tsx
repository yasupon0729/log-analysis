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

type RawAnnotationMetrics = Record<string, number | undefined>;

interface RawAnnotationBoundary {
  id?: string | number;
  polygon: { vertices: RawAnnotationPoint[] };
  bbox: [number, number, number, number];
  score: number;
  iou: number;
  metrics?: RawAnnotationMetrics;
}

type RawMetricStats = Record<
  string,
  {
    label: string;
    min: number;
    max: number;
  }
>;

interface RawAnnotationResponse {
  ok: boolean;
  annotation?: {
    boundaries: RawAnnotationBoundary[];
    metricStats?: RawMetricStats;
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
  area?: number;
  metrics: RawAnnotationMetrics;
}

interface RegionRenderData extends AnnotationRegion {
  path: Path2D;
}

type SelectionMode = "click" | "range";

interface RangeSelection {
  start: RawAnnotationPoint;
  end: RawAnnotationPoint;
}

type FilterMode = "min" | "max" | "range";

type RemovalOrigin = "manual" | "filter";
type RemovalStatus = "queued" | "removed";

interface AppliedFilterSnapshot {
  key: string;
  label: string;
  mode: FilterMode;
  min: number;
  max: number;
}

interface ReviewEntry {
  id: string;
  origin: RemovalOrigin;
  status: RemovalStatus;
  createdAt: string;
  filtersApplied?: AppliedFilterSnapshot[];
}

interface RawReviewItem extends ReviewEntry {}

interface RawReviewFile {
  version: number;
  updatedAt: string;
  items: RawReviewItem[];
}

interface RawReviewResponse {
  ok: boolean;
  review?: RawReviewFile;
  error?: string;
}

interface AdditionEntry {
  id: string;
  label: string;
  points: RawAnnotationPoint[];
  bbox: [number, number, number, number];
  score?: number;
  iou?: number;
  metrics?: RawAnnotationMetrics;
}

interface RawAdditionFile {
  version: number;
  updatedAt: string;
  items: AdditionEntry[];
}

interface RawAdditionResponse {
  ok: boolean;
  additions?: RawAdditionFile;
  error?: string;
}

const clampValue = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const pickDefaultMetricKey = (stats: RawMetricStats) => {
  if (stats && Object.hasOwn(stats, "area")) {
    return "area";
  }
  const keys = Object.keys(stats);
  return keys[0] ?? "";
};

const formatMetricValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const abs = Math.abs(value);
  if (abs >= 10000) {
    return Math.round(value).toLocaleString();
  }
  if (abs >= 100) {
    return value.toFixed(1);
  }
  if (abs >= 1) {
    return value.toFixed(2);
  }
  return value.toPrecision(3);
};

const computeSliderStep = (min: number, max: number) => {
  const span = Math.abs(max - min);
  if (span === 0) {
    return 1;
  }
  if (span <= 1) {
    const step = Number((span / 50).toFixed(4));
    return step > 0 ? step : 0.0001;
  }
  return Math.max(1, Math.round(span / 200));
};

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
  position: "relative",
  zIndex: 1,
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
  position: "relative",
  zIndex: 5,
});

const filterSectionClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: { base: "16px", md: "18px" },
  borderRadius: "16px",
  borderWidth: "1px",
  borderColor: "rgba(59, 130, 246, 0.45)",
  backgroundColor: "rgba(15, 23, 42, 0.55)",
});

const filterHeaderClass = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontSize: "sm",
  color: "rgba(226, 232, 240, 0.9)",
});

const filterSummaryClass = css({
  fontSize: "xs",
  color: "rgba(148, 163, 184, 0.95)",
  lineHeight: "1.6",
});

const filterAddRowClass = css({
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "center",
});

const filterSelectClass = css({
  flex: "1",
  minWidth: "180px",
  backgroundColor: "rgba(15, 23, 42, 0.85)",
  color: "white",
  borderRadius: "10px",
  borderWidth: "1px",
  borderColor: "rgba(59, 130, 246, 0.6)",
  padding: "8px 12px",
  fontSize: "sm",
});

const filterListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
});

const filterCardClass = css({
  borderWidth: "1px",
  borderColor: "rgba(59, 130, 246, 0.4)",
  borderRadius: "14px",
  padding: "12px",
  backgroundColor: "rgba(15, 23, 42, 0.35)",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
});

const filterCardHeaderClass = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
});

const filterLabelClass = css({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "sm",
  color: "rgba(226, 232, 240, 0.95)",
});

const filterCheckboxClass = css({
  accentColor: "#2563eb",
  width: "18px",
  height: "18px",
});

const filterModeSelectClass = css({
  backgroundColor: "rgba(37, 99, 235, 0.15)",
  borderWidth: "1px",
  borderColor: "rgba(59, 130, 246, 0.6)",
  color: "rgba(191, 219, 254, 1)",
  borderRadius: "999px",
  padding: "4px 10px",
  fontSize: "sm",
});

const filterControlsClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
});

const sliderInputClass = css({
  WebkitAppearance: "none",
  appearance: "none",
  width: "100%",
  height: "6px",
  borderRadius: "999px",
  backgroundColor: "rgba(59, 130, 246, 0.25)",
  outline: "none",
  cursor: "pointer",
  "&::-webkit-slider-thumb": {
    WebkitAppearance: "none",
    appearance: "none",
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    backgroundColor: "rgba(59, 130, 246, 0.95)",
    boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.25)",
    border: "none",
  },
  "&::-moz-range-thumb": {
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    backgroundColor: "rgba(59, 130, 246, 0.95)",
    boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.25)",
    border: "none",
  },
});

const sliderMetaClass = css({
  fontSize: "xs",
  color: "rgba(148, 163, 184, 0.9)",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
});

const filterValueBadgeClass = css({
  fontSize: "xs",
  color: "rgba(191, 219, 254, 0.95)",
});

const filterActionRowClass = css({
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
});

const rangeControlRowClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "6px",
});

const additionSectionClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: { base: "16px", md: "18px" },
  borderRadius: "16px",
  borderWidth: "1px",
  borderColor: "rgba(34, 197, 94, 0.35)",
  backgroundColor: "rgba(6, 78, 59, 0.4)",
});

const additionListClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  maxHeight: "220px",
  overflowY: "auto",
});

const additionItemClass = css({
  borderWidth: "1px",
  borderColor: "rgba(16, 185, 129, 0.45)",
  borderRadius: "12px",
  padding: "10px",
  backgroundColor: "rgba(6, 95, 70, 0.55)",
  color: "rgba(236, 253, 245, 0.9)",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
});

const additionMetaClass = css({
  fontSize: "xs",
  color: "rgba(209, 250, 229, 0.9)",
});

const additionControlsClass = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
});

const additionBadgeClass = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  fontSize: "xs",
  color: "rgba(74, 222, 128, 0.95)",
});

const additionDraftActionsClass = css({
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
});

const computeBoundingBox = (
  points: RawAnnotationPoint[],
): [number, number, number, number] => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return [minX, minY, maxX - minX, maxY - minY];
};

const computePolygonArea = (points: RawAnnotationPoint[]) => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
};

const distanceBetweenPoints = (a: RawAnnotationPoint, b: RawAnnotationPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

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
  position: "relative",
  zIndex: 5,
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
  const [reviewEntries, setReviewEntries] = useState<
    Record<string, ReviewEntry>
  >({});
  const [reviewVersion, setReviewVersion] = useState<number | null>(null);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [additionEntries, setAdditionEntries] = useState<AdditionEntry[]>([]);
  const [additionVersion, setAdditionVersion] = useState<number | null>(null);
  const [pendingAdditions, setPendingAdditions] = useState<AdditionEntry[]>([]);
  const [isSavingAdditions, setIsSavingAdditions] = useState(false);
  const [additionDraftPoints, setAdditionDraftPoints] = useState<
    RawAnnotationPoint[]
  >([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImageReady, setIsImageReady] = useState(false);
  const [regionVersion, setRegionVersion] = useState(0);
  const [isFetching, setIsFetching] = useState(true);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("click");
  const [isAdditionMode, setIsAdditionMode] = useState(false);
  interface MetricFilterState {
    enabled: boolean;
    mode: FilterMode;
    min: number;
    max: number;
  }

  const [metricStats, setMetricStats] = useState<RawMetricStats>({});
  const [metricFilters, setMetricFilters] = useState<
    Record<string, MetricFilterState>
  >({});
  const [filterOrder, setFilterOrder] = useState<string[]>([]);
  const [pendingMetricKey, setPendingMetricKey] = useState<string>("");

  const rangeSelectionRef = useRef<RangeSelection | null>(null);
  const isRangeSelectingRef = useRef(false);
  const additionRegionIdsRef = useRef<Set<string>>(new Set());
  const additionHoverPointRef = useRef<RawAnnotationPoint | null>(null);
  const isAdditionDrawingRef = useRef(false);
  const lastAdditionPointRef = useRef<RawAnnotationPoint | null>(null);

  const removalEntryList = useMemo(
    () => Object.values(reviewEntries),
    [reviewEntries],
  );
  const removalIdSet = useMemo(
    () => new Set(Object.keys(reviewEntries)),
    [reviewEntries],
  );

  const resetAdditionRegions = useCallback(() => {
    if (additionRegionIdsRef.current.size === 0) {
      return;
    }
    const identifiers = additionRegionIdsRef.current;
    regionSourceRef.current = regionSourceRef.current.filter(
      (region) => !identifiers.has(region.id),
    );
    additionRegionIdsRef.current = new Set();
    setAdditionDraftPoints([]);
    additionHoverPointRef.current = null;
    setAdditionDraftPoints([]);
    lastAdditionPointRef.current = null;
    isAdditionDrawingRef.current = false;
    setRegionVersion((version) => version + 1);
  }, []);

  const mergeAdditionRegions = useCallback((entries: AdditionEntry[]) => {
    if (!entries.length) {
      return;
    }
    const existingIds = new Set(
      regionSourceRef.current.map((region) => region.id),
    );
    const additions: AnnotationRegion[] = [];
    for (const entry of entries) {
      if (existingIds.has(entry.id)) {
        additionRegionIdsRef.current.add(entry.id);
        continue;
      }
      additionRegionIdsRef.current.add(entry.id);
      additions.push({
        id: entry.id,
        label: entry.label ?? `追加領域 ${entry.id}`,
        score: entry.score ?? 1,
        iou: entry.iou ?? 1,
        points: entry.points.map((point) => ({ ...point })),
        bbox: entry.bbox,
        area: entry.metrics?.area,
        metrics: entry.metrics ?? {},
      });
    }
    if (additions.length > 0) {
      regionSourceRef.current = [...regionSourceRef.current, ...additions];
      setRegionVersion((version) => version + 1);
    }
  }, []);

  const removeAdditionRegionById = useCallback((regionId: string) => {
    if (!additionRegionIdsRef.current.has(regionId)) {
      return;
    }
    additionRegionIdsRef.current.delete(regionId);
    const next = regionSourceRef.current.filter(
      (region) => region.id !== regionId,
    );
    regionSourceRef.current = next;
    setRegionVersion((version) => version + 1);
  }, []);

  const hoveredRegion = useMemo(() => {
    return (
      regionDataRef.current.find((region) => region.id === hoveredRegionId) ??
      null
    );
  }, [hoveredRegionId]);

  const queueRegions = useMemo(() => {
    if (!regionDataRef.current.length || removalEntryList.length === 0) {
      return [] as Array<{ region: RegionRenderData; entry: ReviewEntry }>;
    }
    const regionMap = new Map(
      regionDataRef.current.map((region) => [region.id, region]),
    );
    const rows: Array<{ region: RegionRenderData; entry: ReviewEntry }> = [];
    for (const entry of removalEntryList) {
      const region = regionMap.get(entry.id);
      if (region) {
        rows.push({ region, entry });
      }
    }
    return rows;
  }, [removalEntryList]);

  const autoFilteredIds = useMemo(() => {
    if (regionVersion === 0 || filterOrder.length === 0) {
      return new Set<string>();
    }
    const activeFilters = filterOrder
      .map((key) => {
        const filter = metricFilters[key];
        if (!filter || !filter.enabled) {
          return null;
        }
        return { key, filter };
      })
      .filter(
        (entry): entry is { key: string; filter: MetricFilterState } =>
          entry !== null,
      );
    if (activeFilters.length === 0) {
      return new Set<string>();
    }
    const filtered = new Set<string>();
    for (const region of regionDataRef.current) {
      const metrics = region.metrics ?? {};
      let shouldFilter = false;
      for (const { key, filter } of activeFilters) {
        const value = metrics[key];
        if (typeof value !== "number") {
          shouldFilter = true;
          break;
        }
        if (filter.mode === "min" && value < filter.min) {
          shouldFilter = true;
          break;
        }
        if (filter.mode === "max" && value > filter.max) {
          shouldFilter = true;
          break;
        }
        if (
          filter.mode === "range" &&
          (value < filter.min || value > filter.max)
        ) {
          shouldFilter = true;
          break;
        }
      }
      if (shouldFilter) {
        filtered.add(region.id);
      }
    }
    return filtered;
  }, [filterOrder, metricFilters, regionVersion]);

  const autoFilteredCount = autoFilteredIds.size;

  const metricOptions = useMemo(() => {
    return Object.entries(metricStats).map(([key, stat]) => ({
      key,
      label: stat.label,
    }));
  }, [metricStats]);

  const addableMetricOptions = useMemo(() => {
    if (metricOptions.length === 0) {
      return [] as { key: string; label: string }[];
    }
    return metricOptions.filter((option) => !filterOrder.includes(option.key));
  }, [filterOrder, metricOptions]);

  useEffect(() => {
    if (addableMetricOptions.length === 0) {
      setPendingMetricKey("");
      return;
    }
    if (
      !pendingMetricKey ||
      !metricStats[pendingMetricKey] ||
      filterOrder.includes(pendingMetricKey)
    ) {
      setPendingMetricKey(addableMetricOptions[0].key);
    }
  }, [addableMetricOptions, filterOrder, metricStats, pendingMetricKey]);

  const handleAddFilter = useCallback(() => {
    if (!pendingMetricKey) {
      return;
    }
    const stat = metricStats[pendingMetricKey];
    if (!stat || filterOrder.includes(pendingMetricKey)) {
      return;
    }
    setMetricFilters((current) => ({
      ...current,
      [pendingMetricKey]: {
        enabled: true,
        mode: "min",
        min: stat.min,
        max: stat.max,
      },
    }));
    setFilterOrder((current) => [...current, pendingMetricKey]);

    const remaining = addableMetricOptions
      .map((option) => option.key)
      .filter((key) => key !== pendingMetricKey);
    setPendingMetricKey(remaining[0] ?? "");
  }, [addableMetricOptions, filterOrder, metricStats, pendingMetricKey]);

  const handleRemoveFilter = useCallback((key: string) => {
    setMetricFilters((current) => {
      if (!current[key]) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFilterOrder((current) => current.filter((entry) => entry !== key));
  }, []);

  const handleToggleFilterEnabled = useCallback((key: string) => {
    setMetricFilters((current) => {
      const target = current[key];
      if (!target) {
        return current;
      }
      return {
        ...current,
        [key]: { ...target, enabled: !target.enabled },
      };
    });
  }, []);

  const handleModeChange = useCallback(
    (key: string, mode: FilterMode) => {
      setMetricFilters((current) => {
        const target = current[key];
        const stat = metricStats[key];
        if (!target || !stat) {
          return current;
        }
        let nextMin = clampValue(target.min, stat.min, stat.max);
        let nextMax = clampValue(target.max, stat.min, stat.max);
        if (mode === "range" && nextMin > nextMax) {
          nextMin = stat.min;
          nextMax = stat.max;
        }
        return {
          ...current,
          [key]: {
            ...target,
            mode,
            min: nextMin,
            max: nextMax,
          },
        };
      });
    },
    [metricStats],
  );

  const handleMinValueChange = useCallback(
    (key: string, value: number) => {
      setMetricFilters((current) => {
        const target = current[key];
        const stat = metricStats[key];
        if (!target || !stat) {
          return current;
        }
        const clamped = clampValue(value, stat.min, stat.max);
        const safeValue =
          target.mode === "range" ? Math.min(clamped, target.max) : clamped;
        if (safeValue === target.min) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...target,
            min: safeValue,
          },
        };
      });
    },
    [metricStats],
  );

  const handleMaxValueChange = useCallback(
    (key: string, value: number) => {
      setMetricFilters((current) => {
        const target = current[key];
        const stat = metricStats[key];
        if (!target || !stat) {
          return current;
        }
        const clamped = clampValue(value, stat.min, stat.max);
        const safeValue =
          target.mode === "range" ? Math.max(clamped, target.min) : clamped;
        if (safeValue === target.max) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...target,
            max: safeValue,
          },
        };
      });
    },
    [metricStats],
  );

  const handleResetFilter = useCallback(
    (key: string) => {
      setMetricFilters((current) => {
        const target = current[key];
        const stat = metricStats[key];
        if (!target || !stat) {
          return current;
        }
        return {
          ...current,
          [key]: {
            ...target,
            enabled: true,
            min: stat.min,
            max: stat.max,
          },
        };
      });
    },
    [metricStats],
  );

  const buildActiveFilterSnapshots = useCallback(() => {
    return filterOrder
      .map((key) => {
        const filter = metricFilters[key];
        const stat = metricStats[key];
        if (!filter || !stat || !filter.enabled) {
          return null;
        }
        return {
          key,
          label: stat.label,
          mode: filter.mode,
          min: filter.min,
          max: filter.max,
        } satisfies AppliedFilterSnapshot;
      })
      .filter(
        (snapshot): snapshot is AppliedFilterSnapshot => snapshot !== null,
      );
  }, [filterOrder, metricFilters, metricStats]);

  const handleApplyFiltersToQueue = useCallback(() => {
    if (autoFilteredIds.size === 0) {
      setStatusMessage("現在のフィルタに該当する領域はありません。");
      setTimeout(() => setStatusMessage(null), 3200);
      return;
    }
    const filterSnapshots = buildActiveFilterSnapshots();
    if (filterSnapshots.length === 0) {
      setStatusMessage("有効なフィルタがありません。");
      setTimeout(() => setStatusMessage(null), 3200);
      return;
    }
    const timestamp = new Date().toISOString();
    const ids = Array.from(autoFilteredIds);
    setReviewEntries((current) => {
      const next = { ...current };
      for (const id of ids) {
        next[id] = {
          id,
          origin: "filter",
          status: "queued",
          createdAt: timestamp,
          filtersApplied: filterSnapshots.map((snapshot) => ({ ...snapshot })),
        };
      }
      return next;
    });
    setStatusMessage(`フィルタ対象 ${ids.length} 件をキューに反映しました。`);
    setTimeout(() => setStatusMessage(null), 3200);
  }, [autoFilteredIds, buildActiveFilterSnapshots]);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = contextRef.current;
    const image = imageRef.current;
    if (!canvas || !ctx || !image) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const queueSet = removalIdSet;
    const filteredSet = autoFilteredIds;

    for (const region of regionDataRef.current) {
      const isHovered = region.id === hoveredRegionId;
      const isQueued = queueSet.has(region.id);
      const isFiltered = filteredSet.has(region.id);
      const fill = isQueued
        ? isHovered
          ? "rgba(220, 38, 38, 0.45)"
          : "rgba(248, 113, 113, 0.35)"
        : isFiltered
          ? "rgba(148, 163, 184, 0.25)"
          : isHovered
            ? "rgba(37, 99, 235, 0.40)"
            : "rgba(37, 99, 235, 0.18)";
      const stroke = isQueued
        ? "#dc2626"
        : isFiltered
          ? "rgba(148, 163, 184, 0.85)"
          : isHovered
            ? "#1d4ed8"
            : "#2563eb";

      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isHovered ? 2.4 : isFiltered ? 1.2 : 1.6;
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

    if (additionDraftPoints.length > 0) {
      const previewPoints = [...additionDraftPoints];
      if (isAdditionMode && additionHoverPointRef.current) {
        previewPoints.push(additionHoverPointRef.current);
      }
      if (previewPoints.length >= 2) {
        ctx.save();
        ctx.strokeStyle = "rgba(16, 185, 129, 0.95)";
        ctx.lineWidth = 2;
        ctx.setLineDash(
          previewPoints.length > additionDraftPoints.length ? [4, 3] : [],
        );
        ctx.beginPath();
        ctx.moveTo(previewPoints[0].x, previewPoints[0].y);
        for (let i = 1; i < previewPoints.length; i += 1) {
          ctx.lineTo(previewPoints[i].x, previewPoints[i].y);
        }
        if (previewPoints.length === additionDraftPoints.length) {
          ctx.closePath();
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (additionDraftPoints.length >= 3) {
          ctx.fillStyle = "rgba(16, 185, 129, 0.14)";
          ctx.fill();
        }
        ctx.fillStyle = "rgba(16, 185, 129, 0.95)";
        for (const point of additionDraftPoints) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }, [
    additionDraftPoints,
    autoFilteredIds,
    hoveredRegionId,
    isAdditionMode,
    removalIdSet,
  ]);

  const renderScene = useCallback(() => {
    if (!isImageReady || regionDataRef.current.length === 0) {
      return;
    }
    drawScene();
  }, [drawScene, isImageReady]);

  const handleAddDraftPoint = useCallback(
    (point: RawAnnotationPoint, replaceLast = false) => {
      setAdditionDraftPoints((current) => {
        if (replaceLast && current.length > 0) {
          const next = [...current];
          next[next.length - 1] = point;
          return next;
        }
        return [...current, point];
      });
      lastAdditionPointRef.current = point;
      additionHoverPointRef.current = null;
      renderScene();
    },
    [renderScene],
  );

  const handleAdditionDragPoint = useCallback(
    (point: RawAnnotationPoint) => {
      const lastPoint = lastAdditionPointRef.current;
      if (!lastPoint) {
        handleAddDraftPoint(point);
        return;
      }
      if (distanceBetweenPoints(lastPoint, point) < 3) {
        return;
      }
      handleAddDraftPoint(point);
    },
    [handleAddDraftPoint],
  );

  const handleUndoDraftPoint = useCallback(() => {
    setAdditionDraftPoints((current) => {
      if (current.length === 0) {
        return current;
      }
      return current.slice(0, current.length - 1);
    });
    additionHoverPointRef.current = null;
    renderScene();
  }, [renderScene]);

  const handleFinalizeAdditionDraft = useCallback(() => {
    if (additionDraftPoints.length < 3) {
      setStatusMessage("加筆するには 3 点以上が必要です。");
      setTimeout(() => setStatusMessage(null), 3200);
      return;
    }
    const id = `addition-${Date.now()}`;
    const label = `手動追加 ${additionEntries.length + pendingAdditions.length + 1}`;
    const points = additionDraftPoints.map((point) => ({ ...point }));
    const bbox = computeBoundingBox(points);
    const area = computePolygonArea(points);
    const entry: AdditionEntry = {
      id,
      label,
      points,
      bbox,
      score: 1,
      iou: 1,
      metrics: {
        area: Number(area.toFixed(2)),
      },
    };
    setPendingAdditions((current) => [...current, entry]);
    mergeAdditionRegions([entry]);
    setAdditionDraftPoints([]);
    additionHoverPointRef.current = null;
    lastAdditionPointRef.current = null;
    setStatusMessage(`加筆領域を追加しました (${label})`);
    setTimeout(() => setStatusMessage(null), 3200);
  }, [
    additionDraftPoints,
    additionEntries.length,
    mergeAdditionRegions,
    pendingAdditions.length,
  ]);

  const handleClearAdditionDraft = useCallback(() => {
    setAdditionDraftPoints([]);
    additionHoverPointRef.current = null;
    lastAdditionPointRef.current = null;
    isAdditionDrawingRef.current = false;
    renderScene();
  }, [renderScene]);

  const handleSaveReview = useCallback(async () => {
    if (removalEntryList.length === 0) {
      setStatusMessage("保存対象が選択されていません。");
      setTimeout(() => setStatusMessage(null), 3200);
      return;
    }
    setIsSavingReview(true);
    try {
      const response = await fetch("/api/annotation/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: reviewVersion ?? undefined,
          items: removalEntryList,
        }),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `review save failed: ${response.status}`);
      }
      const payload = (await response.json()) as RawReviewResponse;
      if (!payload.ok || !payload.review) {
        throw new Error(payload.error ?? "保存レスポンスが不正です");
      }
      setReviewVersion(payload.review.version);
      setReviewEntries(
        payload.review.items.reduce<Record<string, ReviewEntry>>(
          (acc, item) => {
            acc[item.id] = item;
            return acc;
          },
          {},
        ),
      );
      setStatusMessage(
        `レビュー情報を保存しました (${payload.review.items.length} 件)。`,
      );
      setTimeout(() => setStatusMessage(null), 3200);
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "レビュー情報の保存に失敗しました";
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(null), 4800);
    } finally {
      setIsSavingReview(false);
    }
  }, [removalEntryList, reviewVersion]);

  const handleRemovePendingAddition = useCallback(
    (additionId: string) => {
      setPendingAdditions((current) =>
        current.filter((entry) => entry.id !== additionId),
      );
      removeAdditionRegionById(additionId);
    },
    [removeAdditionRegionById],
  );

  const handleClearPendingAdditions = useCallback(() => {
    setPendingAdditions((current) => {
      for (const entry of current) {
        removeAdditionRegionById(entry.id);
      }
      return [];
    });
  }, [removeAdditionRegionById]);

  const handleSaveAdditions = useCallback(async () => {
    if (pendingAdditions.length === 0) {
      setStatusMessage("保存する加筆がありません。");
      setTimeout(() => setStatusMessage(null), 3200);
      return;
    }
    setIsSavingAdditions(true);
    try {
      const payloadItems = [...additionEntries, ...pendingAdditions];
      const response = await fetch("/api/annotation/additions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: additionVersion ?? undefined,
          items: payloadItems,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `additions save failed: ${response.status}`);
      }
      const payload = (await response.json()) as RawAdditionResponse;
      if (!payload.ok || !payload.additions) {
        throw new Error(payload.error ?? "加筆保存レスポンスが不正です");
      }
      resetAdditionRegions();
      setAdditionVersion(payload.additions.version);
      setAdditionEntries(payload.additions.items);
      setPendingAdditions([]);
      mergeAdditionRegions(payload.additions.items);
      setStatusMessage(
        `加筆データを保存しました (${payload.additions.items.length} 件)。`,
      );
      setTimeout(() => setStatusMessage(null), 3200);
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "加筆データの保存に失敗しました";
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(null), 4800);
    } finally {
      setIsSavingAdditions(false);
    }
  }, [
    additionEntries,
    additionVersion,
    mergeAdditionRegions,
    pendingAdditions,
    resetAdditionRegions,
  ]);

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
    setReviewEntries((current) => {
      if (current[regionId]) {
        const next = { ...current };
        delete next[regionId];
        return next;
      }
      const entry: ReviewEntry = {
        id: regionId,
        origin: "manual",
        status: "queued",
        createdAt: new Date().toISOString(),
      };
      return { ...current, [regionId]: entry };
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
    setReviewEntries((current) => {
      let mutated = false;
      const next = { ...current };
      for (const region of containedRegions) {
        if (next[region.id]) {
          delete next[region.id];
          tally.removed += 1;
          mutated = true;
        } else {
          next[region.id] = {
            id: region.id,
            origin: "manual",
            status: "queued",
            createdAt: new Date().toISOString(),
          };
          tally.added += 1;
          mutated = true;
        }
      }
      return mutated ? next : current;
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
      if (isAdditionMode) {
        const point = getCanvasPoint(event);
        if (point && isAdditionDrawingRef.current) {
          handleAdditionDragPoint(point);
        } else {
          additionHoverPointRef.current = point;
          renderScene();
        }
        return;
      }
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
    [
      getCanvasPoint,
      handleAdditionDragPoint,
      handleCanvasPointer,
      isAdditionMode,
      renderScene,
      selectionMode,
    ],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (isAdditionMode) {
        const point = getCanvasPoint(event);
        if (!point) {
          return;
        }
        handleAddDraftPoint(point);
        isAdditionDrawingRef.current = true;
        return;
      }
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
    [
      getCanvasPoint,
      handleAddDraftPoint,
      handleCanvasPointer,
      isAdditionMode,
      renderScene,
      selectionMode,
    ],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (isAdditionMode && isAdditionDrawingRef.current) {
        isAdditionDrawingRef.current = false;
        additionHoverPointRef.current = null;
        renderScene();
        return;
      }
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
    [isAdditionMode, renderScene, selectRegionsWithinBounds, selectionMode],
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      setHoveredRegionId(null);
      if (isAdditionMode) {
        additionHoverPointRef.current = null;
        isAdditionDrawingRef.current = false;
        renderScene();
        return;
      }
      if (selectionMode === "range") {
        cancelRangeSelection(event.pointerId);
      }
    },
    [cancelRangeSelection, isAdditionMode, renderScene, selectionMode],
  );

  const handleClearQueue = useCallback(() => {
    setReviewEntries({});
  }, []);

  useEffect(() => {
    if (selectionMode === "click") {
      cancelRangeSelection();
    }
  }, [cancelRangeSelection, selectionMode]);

  useEffect(() => {
    if (!isAdditionMode) {
      if (
        additionDraftPoints.length > 0 ||
        additionHoverPointRef.current ||
        lastAdditionPointRef.current
      ) {
        handleClearAdditionDraft();
      }
    }
  }, [additionDraftPoints.length, handleClearAdditionDraft, isAdditionMode]);

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
          payload.annotation.boundaries.map((boundary, index) => {
            const resolvedId = boundary.id ?? index + 1;
            const regionId = String(resolvedId);
            const metrics = boundary.metrics ?? {};
            return {
              id: regionId,
              label: `領域 ${regionId}`,
              score: boundary.score,
              iou: boundary.iou,
              points: boundary.polygon.vertices.map((vertex) => ({
                ...vertex,
              })),
              bbox: boundary.bbox,
              area: typeof metrics.area === "number" ? metrics.area : undefined,
              metrics,
            };
          });

        if (isMounted) {
          const metricStatPayload = payload.annotation.metricStats ?? {};
          setMetricStats(metricStatPayload);

          setMetricFilters((current) => {
            const currentKeys = Object.keys(current);
            if (currentKeys.length === 0) {
              const defaultKey = pickDefaultMetricKey(metricStatPayload);
              if (!defaultKey) {
                return {};
              }
              const defaultStat = metricStatPayload[defaultKey];
              return defaultStat
                ? {
                    [defaultKey]: {
                      enabled: true,
                      mode: "min",
                      min: defaultStat.min,
                      max: defaultStat.max,
                    },
                  }
                : {};
            }

            const next = { ...current } as Record<string, MetricFilterState>;
            for (const key of currentKeys) {
              const stat = metricStatPayload[key];
              if (!stat) {
                delete next[key];
                continue;
              }
              next[key] = {
                ...next[key],
                min: clampValue(next[key].min, stat.min, stat.max),
                max: clampValue(next[key].max, stat.min, stat.max),
              };
            }
            return next;
          });

          setFilterOrder((current) => {
            if (current.length > 0) {
              const cleaned = current.filter((key) => key in metricStatPayload);
              if (cleaned.length > 0) {
                return cleaned;
              }
            }
            const defaultKey = pickDefaultMetricKey(metricStatPayload);
            return defaultKey ? [defaultKey] : [];
          });

          setPendingMetricKey((current) => {
            if (current && metricStatPayload[current]) {
              return current;
            }
            return pickDefaultMetricKey(metricStatPayload);
          });

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
    const controller = new AbortController();
    let isMounted = true;

    const fetchReview = async () => {
      try {
        const response = await fetch("/api/annotation/review", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`review fetch failed: ${response.status}`);
        }
        const payload = (await response.json()) as RawReviewResponse;
        if (!payload.ok || !payload.review) {
          throw new Error(payload.error ?? "annotation review data is invalid");
        }
        if (isMounted) {
          setReviewVersion(payload.review.version);
          setReviewEntries(
            payload.review.items.reduce<Record<string, ReviewEntry>>(
              (acc, item) => {
                acc[item.id] = item;
                return acc;
              },
              {},
            ),
          );
        }
      } catch (reviewError) {
        if (!isMounted || controller.signal.aborted) {
          return;
        }
        const message =
          reviewError instanceof Error
            ? reviewError.message
            : "レビュー情報の取得に失敗しました";
        setStatusMessage(message);
        setTimeout(() => setStatusMessage(null), 3200);
      }
    };

    void fetchReview();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;

    const fetchAdditions = async () => {
      try {
        const response = await fetch("/api/annotation/additions", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`additions fetch failed: ${response.status}`);
        }
        const payload = (await response.json()) as RawAdditionResponse;
        if (!payload.ok || !payload.additions) {
          throw new Error(
            payload.error ?? "annotation additions data is invalid",
          );
        }
        if (isMounted) {
          resetAdditionRegions();
          setAdditionVersion(payload.additions.version);
          setAdditionEntries(payload.additions.items);
          mergeAdditionRegions(payload.additions.items);
        }
      } catch (additionError) {
        if (!isMounted || controller.signal.aborted) {
          return;
        }
        const message =
          additionError instanceof Error
            ? additionError.message
            : "加筆データの取得に失敗しました";
        setStatusMessage(message);
        setTimeout(() => setStatusMessage(null), 3200);
      }
    };

    void fetchAdditions();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [mergeAdditionRegions, resetAdditionRegions]);

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
              {typeof hoveredRegion.area === "number" ? (
                <span>{`area: ${Math.round(hoveredRegion.area).toLocaleString()} px²`}</span>
              ) : null}
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
          <div
            className={selectionButtonsClass}
            role="radiogroup"
            aria-label="選択モード"
          >
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
            に矩形をドラッグし、その範囲に完全に含まれる領域を一括で追加 /
            解除します。
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

        <div className={filterSectionClass}>
          <div className={filterHeaderClass}>
            <span>メトリクスしきい値</span>
            <span>{`自動除外: ${autoFilteredCount} 件`}</span>
          </div>
          <p className={filterSummaryClass}>
            CSV に含まれる任意の指標をフィルタに追加し、下限 / 上限 /
            範囲ベースで柔軟に誤認識候補を除外できます。
          </p>
          <div className={filterAddRowClass}>
            <select
              className={filterSelectClass}
              value={pendingMetricKey}
              onChange={(event) => setPendingMetricKey(event.target.value)}
              disabled={addableMetricOptions.length === 0}
            >
              {pendingMetricKey === "" ? (
                <option value="" disabled>
                  追加可能なメトリクスはありません
                </option>
              ) : null}
              {addableMetricOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddFilter}
              disabled={!pendingMetricKey}
            >
              フィルタを追加
            </Button>
          </div>
          {filterOrder.length > 0 ? (
            <div className={filterListClass}>
              {filterOrder.map((key) => {
                const stat = metricStats[key];
                const filter = metricFilters[key];
                if (!stat || !filter) {
                  return null;
                }
                const sliderStep = computeSliderStep(stat.min, stat.max);
                const disabled = !filter.enabled;
                return (
                  <div key={key} className={filterCardClass}>
                    <div className={filterCardHeaderClass}>
                      <label className={filterLabelClass}>
                        <input
                          type="checkbox"
                          className={filterCheckboxClass}
                          checked={filter.enabled}
                          onChange={() => handleToggleFilterEnabled(key)}
                        />
                        {stat.label}
                      </label>
                      <select
                        className={filterModeSelectClass}
                        value={filter.mode}
                        onChange={(event) =>
                          handleModeChange(
                            key,
                            event.target.value as FilterMode,
                          )
                        }
                        disabled={disabled}
                      >
                        <option value="min">下限 (&ge;)</option>
                        <option value="max">上限 (&le;)</option>
                        <option value="range">範囲</option>
                      </select>
                    </div>
                    <div className={filterControlsClass}>
                      {filter.mode === "min" ? (
                        <div className={rangeControlRowClass}>
                          <input
                            type="range"
                            className={sliderInputClass}
                            min={stat.min}
                            max={stat.max}
                            step={sliderStep}
                            value={filter.min}
                            disabled={disabled}
                            onChange={(event) =>
                              handleMinValueChange(
                                key,
                                Number(event.target.value),
                              )
                            }
                          />
                          <span
                            className={filterValueBadgeClass}
                          >{`下限: ${formatMetricValue(filter.min)}`}</span>
                        </div>
                      ) : null}
                      {filter.mode === "max" ? (
                        <div className={rangeControlRowClass}>
                          <input
                            type="range"
                            className={sliderInputClass}
                            min={stat.min}
                            max={stat.max}
                            step={sliderStep}
                            value={filter.max}
                            disabled={disabled}
                            onChange={(event) =>
                              handleMaxValueChange(
                                key,
                                Number(event.target.value),
                              )
                            }
                          />
                          <span
                            className={filterValueBadgeClass}
                          >{`上限: ${formatMetricValue(filter.max)}`}</span>
                        </div>
                      ) : null}
                      {filter.mode === "range" ? (
                        <>
                          <div className={rangeControlRowClass}>
                            <input
                              type="range"
                              className={sliderInputClass}
                              min={stat.min}
                              max={stat.max}
                              step={sliderStep}
                              value={filter.min}
                              disabled={disabled}
                              onChange={(event) =>
                                handleMinValueChange(
                                  key,
                                  Number(event.target.value),
                                )
                              }
                            />
                            <span
                              className={filterValueBadgeClass}
                            >{`下限: ${formatMetricValue(filter.min)}`}</span>
                          </div>
                          <div className={rangeControlRowClass}>
                            <input
                              type="range"
                              className={sliderInputClass}
                              min={stat.min}
                              max={stat.max}
                              step={sliderStep}
                              value={filter.max}
                              disabled={disabled}
                              onChange={(event) =>
                                handleMaxValueChange(
                                  key,
                                  Number(event.target.value),
                                )
                              }
                            />
                            <span
                              className={filterValueBadgeClass}
                            >{`上限: ${formatMetricValue(filter.max)}`}</span>
                          </div>
                        </>
                      ) : null}
                      <div className={sliderMetaClass}>
                        <span>{`データ範囲: ${formatMetricValue(stat.min)} 〜 ${formatMetricValue(stat.max)}`}</span>
                      </div>
                      <div className={filterActionRowClass}>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleResetFilter(key)}
                          disabled={disabled}
                        >
                          リセット
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveFilter(key)}
                        >
                          削除
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={filterSummaryClass}>
              フィルタが追加されていません。上のリストから指標を選択して追加してください。
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleApplyFiltersToQueue}
            disabled={autoFilteredIds.size === 0 || filterOrder.length === 0}
          >
            フィルタ結果をキューに追加
          </Button>
        </div>

        <div className={additionSectionClass}>
          <div className={filterHeaderClass}>
            <span>加筆モード（クリックで多角形）</span>
            <Button
              type="button"
              size="sm"
              variant={isAdditionMode ? "solid" : "outline"}
              onClick={() => setIsAdditionMode((mode) => !mode)}
            >
              {isAdditionMode ? "終了する" : "開始する"}
            </Button>
          </div>
          <p className={filterSummaryClass}>
            加筆モード中は Canvas 上でクリックするたびに頂点を追加します。3
            点以上になったら「多角形を確定」を押すと手動加筆として登録されます。
          </p>
          <div className={additionDraftActionsClass}>
            <span
              className={additionMetaClass}
            >{`現在の頂点数: ${additionDraftPoints.length}`}</span>
            <Button
              type="button"
              size="sm"
              variant="solid"
              onClick={handleFinalizeAdditionDraft}
              disabled={additionDraftPoints.length < 3}
            >
              多角形を確定
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleUndoDraftPoint}
              disabled={additionDraftPoints.length === 0}
            >
              最後の頂点を削除
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleClearAdditionDraft}
              disabled={additionDraftPoints.length === 0}
            >
              リセット
            </Button>
          </div>
          {pendingAdditions.length > 0 ? (
            <div className={additionListClass}>
              {pendingAdditions.map((entry) => (
                <div key={entry.id} className={additionItemClass}>
                  <div className={additionBadgeClass}>{entry.label}</div>
                  <div className={additionMetaClass}>
                    {`bbox: [${entry.bbox.map((value) => Math.round(value)).join(", ")}]`}
                  </div>
                  {entry.metrics?.area ? (
                    <div className={additionMetaClass}>
                      {`area: ${Math.round(entry.metrics.area).toLocaleString()} px²`}
                    </div>
                  ) : null}
                  <div className={additionControlsClass}>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemovePendingAddition(entry.id)}
                    >
                      削除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={filterSummaryClass}>未保存の加筆はありません。</div>
          )}
          <div className={additionControlsClass}>
            <Button
              type="button"
              variant="solid"
              size="sm"
              onClick={handleSaveAdditions}
              disabled={pendingAdditions.length === 0 || isSavingAdditions}
              isLoading={isSavingAdditions}
            >
              加筆を保存
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearPendingAdditions}
              disabled={pendingAdditions.length === 0}
            >
              未保存を破棄
            </Button>
          </div>
        </div>

        {queueRegions.length > 0 ? (
          <div className={queueListClass}>
            {queueRegions.map(({ region, entry }) => (
              <div key={region.id} className={queueItemClass}>
                <div>{region.label}</div>
                <div className={queueMetaClass}>
                  {`score: ${region.score.toFixed(3)} / IoU: ${region.iou.toFixed(3)}`}
                </div>
                {typeof region.area === "number" ? (
                  <div
                    className={queueMetaClass}
                  >{`area: ${Math.round(region.area).toLocaleString()} px²`}</div>
                ) : null}
                <div className={queueMetaClass}>{`origin: ${
                  entry.origin === "filter" ? "フィルタ反映" : "手動選択"
                }`}</div>
                <div
                  className={queueMetaClass}
                >{`status: ${entry.status}`}</div>
                {entry.filtersApplied && entry.filtersApplied.length > 0 ? (
                  <div className={queueMetaClass}>
                    {`filters: ${entry.filtersApplied
                      .map((snapshot) => {
                        if (snapshot.mode === "min") {
                          return `${snapshot.label} >= ${formatMetricValue(snapshot.min)}`;
                        }
                        if (snapshot.mode === "max") {
                          return `${snapshot.label} <= ${formatMetricValue(snapshot.max)}`;
                        }
                        return `${snapshot.label} ${formatMetricValue(snapshot.min)}〜${formatMetricValue(snapshot.max)}`;
                      })
                      .join(", ")}`}
                  </div>
                ) : null}
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
          onClick={handleSaveReview}
          disabled={removalEntryList.length === 0 || isSavingReview}
          isLoading={isSavingReview}
        >
          レビュー状態を保存
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={handleClearQueue}
          disabled={removalEntryList.length === 0}
        >
          キューをクリア
        </Button>
      </aside>
    </div>
  );
}
