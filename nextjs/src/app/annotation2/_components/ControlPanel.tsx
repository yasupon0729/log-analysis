"use client";

import { css } from "../../../../styled-system/css";
import { getFilterExpression } from "../_lib/filter-utils";
import type {
  FilterCondition,
  FilterGroup,
  FilterNode,
  MetricStat,
} from "../_types";

interface ControlPanelProps {
  stats: MetricStat[];
  rootGroup: FilterGroup;
  maxDepth: number;
  onUpdateRoot: (newRoot: FilterGroup) => void;
}

export function ControlPanel({
  stats,
  rootGroup,
  maxDepth,
  onUpdateRoot,
}: ControlPanelProps) {
  // --- Helpers ---
  const updateNode = (
    node: FilterNode,
    targetId: string,
    updater: (n: FilterNode) => FilterNode,
  ): FilterNode => {
    if (node.id === targetId) {
      return updater(node);
    }
    if (node.type === "group") {
      return {
        ...node,
        children: node.children.map((child) =>
          updateNode(child, targetId, updater),
        ) as (FilterGroup | FilterCondition)[],
      };
    }
    return node;
  };

  const deleteNode = (node: FilterGroup, targetId: string): FilterGroup => {
    return {
      ...node,
      children: node.children
        .filter((child) => child.id !== targetId)
        .map((child) =>
          child.type === "group" ? deleteNode(child, targetId) : child,
        ) as (FilterGroup | FilterCondition)[],
    };
  };

  const addNode = (
    node: FilterGroup,
    parentId: string,
    newNode: FilterNode,
  ): FilterGroup => {
    if (node.id === parentId) {
      return { ...node, children: [...node.children, newNode] };
    }
    return {
      ...node,
      children: node.children.map((child) =>
        child.type === "group" ? addNode(child, parentId, newNode) : child,
      ) as (FilterGroup | FilterCondition)[],
    };
  };

  // --- Handlers ---
  const handleUpdate = (targetId: string, newNode: FilterNode) => {
    if (targetId === rootGroup.id && newNode.type === "group") {
      onUpdateRoot(newNode);
    } else {
      onUpdateRoot(
        updateNode(rootGroup, targetId, () => newNode) as FilterGroup,
      );
    }
  };

  const handleDelete = (targetId: string) => {
    onUpdateRoot(deleteNode(rootGroup, targetId));
  };

  const handleAdd = (parentId: string, type: "group" | "condition") => {
    const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    let newNode: FilterNode;

    if (type === "group") {
      newNode = {
        id,
        type: "group",
        action: "keep",
        logic: "AND",
        children: [],
        enabled: true,
      };
    } else {
      const defaultMetric = stats[0]?.key || "";
      const stat = stats.find((s) => s.key === defaultMetric);
      newNode = {
        id,
        type: "condition",
        metric: defaultMetric,
        min: stat?.min ?? 0,
        max: stat?.max ?? 100,
        enabled: true,
      };
    }
    onUpdateRoot(addNode(rootGroup, parentId, newNode));
  };

  const expression = getFilterExpression(rootGroup);

  return (
    <div
      className={css({
        backgroundColor: "gray.900",
        color: "gray.100",
        padding: "6",
        borderRadius: "xl",
        border: "1px solid token(colors.gray.700)",
        boxShadow: "lg",
        maxHeight: "800px",
        overflowY: "auto",
        position: "sticky",
        top: "4",
      })}
    >
      <div className={css({ marginBottom: "6" })}>
        <h2
          className={css({
            fontSize: "lg",
            fontWeight: "semibold",
            color: "white",
          })}
        >
          Filters (Keep/Remove)
        </h2>
        {/* Logical Expression Display */}
        <div
          className={css({
            marginTop: "3",
            padding: "3",
            backgroundColor: "gray.950",
            border: "1px solid token(colors.gray.700)",
            borderRadius: "md",
            fontFamily: "monospace",
            fontSize: "xs",
            color: "cyan.300",
            wordBreak: "break-all",
            whiteSpace: "pre-wrap",
            lineHeight: "1.5",
          })}
        >
          <strong>Current Logic:</strong>
          <div className={css({ marginTop: "1" })}>
            {expression || "No active filters"}
          </div>
        </div>
      </div>

      <FilterNodeView
        node={rootGroup}
        stats={stats}
        depth={0}
        maxDepth={maxDepth}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onAdd={handleAdd}
      />
    </div>
  );
}

// --- Recursive Component ---

interface FilterNodeViewProps {
  node: FilterNode;
  stats: MetricStat[];
  depth: number;
  maxDepth: number;
  onUpdate: (id: string, newNode: FilterNode) => void;
  onDelete: (id: string) => void;
  onAdd: (parentId: string, type: "group" | "condition") => void;
}

function FilterNodeView({
  node,
  stats,
  depth,
  maxDepth,
  onUpdate,
  onDelete,
  onAdd,
}: FilterNodeViewProps) {
  if (node.type === "group") {
    const isRoot = depth === 0;
    const actionColor = node.action === "keep" ? "lightgreen" : "salmon";

    return (
      <div
        className={css({
          borderLeft: isRoot ? "none" : "2px solid token(colors.gray.700)",
          paddingLeft: isRoot ? 0 : "4",
          marginBottom: "4",
        })}
      >
        {/* Group Header */}
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "2",
            marginBottom: "3",
            backgroundColor: isRoot ? "transparent" : "gray.800",
            padding: isRoot ? 0 : "2",
            borderRadius: "md",
          })}
        >
          <span
            className={css({
              fontWeight: "bold",
              fontSize: "xs",
              color: "blue.400",
              textTransform: "uppercase",
            })}
          >
            {isRoot ? "ROOT" : "GROUP"}
          </span>

          {/* Action Select */}
          <select
            value={node.action}
            onChange={(e) =>
              onUpdate(node.id, {
                ...node,
                action: e.target.value as "keep" | "remove",
              })
            }
            className={selectStyle}
            style={{
              width: "auto",
              minWidth: "80px",
              color: actionColor,
              fontWeight: "bold",
            }}
          >
            <option value="keep">KEEP</option>
            <option value="remove">REMOVE</option>
          </select>

          <select
            value={node.logic}
            onChange={(e) =>
              onUpdate(node.id, {
                ...node,
                logic: e.target.value as "AND" | "OR",
              })
            }
            className={selectStyle}
            style={{ width: "auto", minWidth: "80px" }}
          >
            <option value="AND">AND (All)</option>
            <option value="OR">OR (Any)</option>
          </select>

          {!isRoot && (
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className={css({
                marginLeft: "auto",
                color: "gray.500",
                cursor: "pointer",
                "&:hover": { color: "red.400" },
              })}
            >
              ×
            </button>
          )}
        </div>

        {/* Children */}
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2",
          })}
        >
          {node.children.map((child) => (
            <FilterNodeView
              key={child.id}
              node={child}
              stats={stats}
              depth={depth + 1}
              maxDepth={maxDepth}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAdd={onAdd}
            />
          ))}
          {node.children.length === 0 && (
            <div
              className={css({
                fontSize: "xs",
                color: "gray.500",
                fontStyle: "italic",
                padding: "2",
              })}
            >
              No conditions.
            </div>
          )}
        </div>

        {/* Add Buttons */}
        <div className={css({ marginTop: "3", display: "flex", gap: "2" })}>
          <button
            type="button"
            onClick={() => onAdd(node.id, "condition")}
            className={btnStyle}
          >
            + Condition
          </button>
          {depth < maxDepth - 1 && (
            <button
              type="button"
              onClick={() => onAdd(node.id, "group")}
              className={btnStyle}
            >
              + Group
            </button>
          )}
        </div>
      </div>
    );
  }
  // Condition View
  const stat = stats.find((s) => s.key === node.metric);
  if (!stat) return null;
  const step = (stat.max - stat.min) / 1000;

  return (
    <div
      className={css({
        backgroundColor: "gray.800",
        padding: "3",
        borderRadius: "lg",
        border: "1px solid token(colors.gray.700)",
        marginBottom: "2",
        opacity: node.enabled ? 1 : 0.5, // Visual feedback for disabled state
        transition: "opacity 0.2s",
      })}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          marginBottom: "2",
        })}
      >
        <input
          type="checkbox"
          checked={node.enabled}
          onChange={(e) => onUpdate(node.id, { ...node, enabled: e.target.checked })}
          className={css({ cursor: "pointer" })}
        />

        <select
          value={node.metric}
          disabled={!node.enabled}
          onChange={(e) => {
            const newMetric = e.target.value;
            const newStat = stats.find((s) => s.key === newMetric);
            onUpdate(node.id, {
              ...node,
              metric: newMetric,
              min: newStat?.min ?? 0,
              max: newStat?.max ?? 100,
            });
          }}
          className={selectStyle}
        >
          {stats.map((s) => (
            <option key={s.key} value={s.key}>
              {s.key}
            </option>
          ))}
        </select>

        <div className={css({ display: "flex", gap: "2", marginLeft: "auto" })}>
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            className={css({
              color: "gray.500",
              cursor: "pointer",
              "&:hover": { color: "red.400" },
            })}
          >
            ×
          </button>
        </div>
      </div>

      {/* Slider & Inputs */}
      <div
        className={css({ paddingX: "1", marginTop: "4", marginBottom: "4" })}
      >
        <DoubleRangeSlider
          min={stat.min}
          max={stat.max}
          step={step}
          value={[node.min, node.max]}
          onChange={(min: number, max: number) =>
            onUpdate(node.id, { ...node, min, max })
          }
        />
      </div>

      <div
        className={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
        })}
      >
        <input
          type="number"
          className={inputStyle}
          value={node.min.toFixed(2)}
          onChange={(e) =>
            onUpdate(node.id, { ...node, min: Number(e.target.value) })
          }
        />
        <span className={css({ color: "gray.500" })}>-</span>
        <input
          type="number"
          className={inputStyle}
          value={node.max.toFixed(2)}
          onChange={(e) =>
            onUpdate(node.id, { ...node, max: Number(e.target.value) })
          }
        />
      </div>
    </div>
  );
}

// Styles
const inputStyle = css({
  width: "100%",
  padding: "1",
  borderRadius: "md",
  border: "1px solid token(colors.gray.700)",
  fontSize: "xs",
  backgroundColor: "gray.900",
  color: "white",
  "&:focus": { outline: "none", borderColor: "blue.500" },
});

const selectStyle = css({
  width: "100%",
  padding: "1",
  borderRadius: "md",
  border: "1px solid token(colors.gray.700)",
  fontSize: "xs",
  backgroundColor: "gray.900",
  color: "white",
  cursor: "pointer",
  "&:focus": { outline: "none", borderColor: "blue.500" },
});

const btnStyle = css({
  padding: "1 3",
  borderRadius: "md",
  fontSize: "xs",
  backgroundColor: "blue.600",
  color: "white",
  cursor: "pointer",
  transition: "background 0.2s",
  "&:hover": { backgroundColor: "blue.700" },
});

// ... DoubleRangeSlider ...

interface DoubleRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (min: number, max: number) => void;
  step: number;
}

function DoubleRangeSlider({
  min,
  max,
  value,
  onChange,
  step,
}: DoubleRangeSliderProps) {
  const [minVal, maxVal] = value;
  const range = max - min || 1;
  const getPercent = (v: number) => ((v - min) / range) * 100;

  return (
    <div
      className={css({
        position: "relative",
        height: "6",
        width: "100%",
        display: "flex",
        alignItems: "center",
      })}
    >
      <div
        className={css({
          position: "absolute",
          width: "100%",
          height: "4px",
          backgroundColor: "gray.700",
          borderRadius: "full",
          zIndex: 0,
        })}
      />
      <div
        className={css({
          position: "absolute",
          height: "4px",
          backgroundColor: "blue.500",
          borderRadius: "full",
          zIndex: 0,
        })}
        style={{
          left: `${Math.max(0, Math.min(100, getPercent(minVal)))}%`,
          width: `${Math.max(
            0,
            Math.min(100, getPercent(maxVal) - getPercent(minVal)),
          )}%`,
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={minVal}
        step={step}
        onChange={(e) => {
          const v = Math.min(Number(e.target.value), maxVal - step);
          onChange(v, maxVal);
        }}
        className={rangeInputStyle}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={maxVal}
        step={step}
        onChange={(e) => {
          const v = Math.max(Number(e.target.value), minVal + step);
          onChange(minVal, v);
        }}
        className={rangeInputStyle}
      />
    </div>
  );
}

const rangeInputStyle = css({
  position: "absolute",
  width: "100%",
  pointerEvents: "none",
  appearance: "none",
  background: "transparent",
  zIndex: 1,
  margin: 0,
  "&::-webkit-slider-thumb": {
    pointerEvents: "auto",
    appearance: "none",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "white",
    border: "2px solid token(colors.blue.500)",
    cursor: "grab",
    "&:active": { cursor: "grabbing" },
  },
  "&::-moz-range-thumb": {
    pointerEvents: "auto",
    appearance: "none",
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    backgroundColor: "white",
    border: "2px solid token(colors.blue.500)",
    cursor: "grab",
    "&:active": { cursor: "grabbing" },
  },
});
