"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { css } from "../../../../styled-system/css";
import { createDefaultConfig, evaluateFilter } from "../_lib/filter-utils";
import {
  type AnnotationRegion,
  type CategoryDef,
  type ClassificationRule,
  DEFAULT_CATEGORIES,
  type FilterConfig,
  type FilterGroup,
  type FilterPreset,
  getCategoryMap,
  type MetricStat,
  PRESET_COLORS,
} from "../_types";
import { calculateBBox } from "../_utils/geometry";
import {
  deleteFilterPreset,
  saveAddedAnnotations,
  saveCategories,
  saveClassifications,
  saveFilterConfig,
  saveFilterPreset,
  savePipeline,
} from "../actions";
import { CanvasLayer } from "./CanvasLayer";
import { ControlPanel } from "./ControlPanel";

interface AnnotationPageClientProps {
  initialRegions: AnnotationRegion[];
  stats: MetricStat[];
  imageUrl: string;
  initialRemovedIds?: number[]; // Legacy
  initialClassifications?: Record<number, number>;
  initialFilterConfig?: FilterConfig | null;
  initialAddedRegions?: AnnotationRegion[];
  initialPresets?: FilterPreset[];
  initialCategories?: CategoryDef[];
  initialRules?: ClassificationRule[];
}

export function AnnotationPageClient({
  initialRegions,
  stats,
  imageUrl,
  initialRemovedIds = [],
  initialClassifications = {},
  initialFilterConfig = null,
  initialAddedRegions = [],
  initialPresets = [],
  initialCategories = DEFAULT_CATEGORIES,
  initialRules = [],
}: AnnotationPageClientProps) {
  // Categories State
  const [categories, setCategories] =
    useState<CategoryDef[]>(initialCategories);
  const categoryMap = useMemo(() => getCategoryMap(categories), [categories]);

  const [classifications, setClassifications] = useState<Map<number, number>>(
    () => {
      const map = new Map<number, number>();
      initialRemovedIds.forEach((id) => {
        map.set(id, 999);
      });
      Object.entries(initialClassifications).forEach(([id, cat]) => {
        map.set(Number(id), Number(cat));
      });
      return map;
    },
  );

  const [presets, setPresets] = useState<FilterPreset[]>(initialPresets);
  const [rules, setRules] = useState<ClassificationRule[]>(initialRules);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  const [fromClassId, setFromClassId] = useState<number | "any">(1);
  const [activeCategory, setActiveCategory] = useState<number>(999); // Default: Remove
  const [editingColorId, setEditingColorId] = useState<number | null>(null);

  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [addedRegions, setAddedRegions] =
    useState<AnnotationRegion[]>(initialAddedRegions);
  const [editMode, setEditMode] = useState<"select" | "draw">("select");
  const [isSaving, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [filterConfig, setFilterConfig] = useState<FilterConfig>(() => {
    if (initialFilterConfig && initialFilterConfig.version === 3) {
      return initialFilterConfig;
    }
    return createDefaultConfig();
  });

  useEffect(() => {
    if (initialFilterConfig && initialFilterConfig.version === 3) {
      console.log("[AnnotationPageClient] Applying initial filter config v3");
      setFilterConfig(initialFilterConfig);
    }
  }, [initialFilterConfig]);

  const allRegions = useMemo(() => {
    return [...initialRegions, ...addedRegions];
  }, [initialRegions, addedRegions]);

  const filteredIds = useMemo(() => {
    const ids = new Set<number>();
    if (!filterConfig.root.enabled) return ids;

    for (const region of allRegions) {
      const currentCat =
        classifications.get(region.id) ?? region.categoryId ?? 1;
      if (fromClassId !== "any" && currentCat !== fromClassId) {
        continue;
      }
      if (!evaluateFilter(filterConfig.root, region)) {
        ids.add(region.id);
      }
    }
    return ids;
  }, [allRegions, filterConfig, classifications, fromClassId]);

  const handleRegionClick = (id: number) => {
    const target = allRegions.find((r) => r.id === id);
    if (target?.isManualAdded) return;

    setClassifications((prev) => {
      const next = new Map(prev);
      const currentCat = next.get(id);
      if (currentCat === activeCategory) {
        next.delete(id);
      } else {
        next.set(id, activeCategory);
      }
      return next;
    });
  };

  const handleRangeSelect = (ids: number[]) => {
    setClassifications((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => {
        const target = allRegions.find((r) => r.id === id);
        if (target?.isManualAdded) return;
        next.set(id, activeCategory);
      });
      return next;
    });
  };

  // --- Pipeline Management ---

  const updateRules = (newRules: ClassificationRule[]) => {
    setRules(newRules);
    startTransition(async () => {
      await savePipeline(newRules);
    });
  };

  const handleAddRule = () => {
    const name = window.prompt("Rule Name:", `Rule ${rules.length + 1}`);
    if (!name) return;

    const newRule: ClassificationRule = {
      id: crypto.randomUUID(),
      name,
      enabled: true,
      fromClass: fromClassId,
      toClass: activeCategory,
      filter: JSON.parse(JSON.stringify(filterConfig.root)), // Deep copy
    };

    updateRules([...rules, newRule]);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!confirm("Delete this rule?")) return;
    updateRules(rules.filter((r) => r.id !== ruleId));
  };

  const handleMoveRule = (index: number, direction: -1 | 1) => {
    const newRules = [...rules];
    if (index + direction < 0 || index + direction >= newRules.length) return;
    const temp = newRules[index];
    newRules[index] = newRules[index + direction];
    newRules[index + direction] = temp;
    updateRules(newRules);
  };

  const handleToggleRule = (ruleId: string) => {
    updateRules(
      rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r)),
    );
  };

  const handleRunPipeline = () => {
    if (!confirm(`Run ${rules.filter((r) => r.enabled).length} rules?`)) return;

    setClassifications((prev) => {
      const next = new Map(prev);

      rules
        .filter((r) => r.enabled)
        .forEach((rule) => {
          // Find matching regions
          const targets: number[] = [];
          for (const region of allRegions) {
            // Current class check
            const currentCat = next.get(region.id) ?? region.categoryId ?? 1;
            if (rule.fromClass !== "any" && currentCat !== rule.fromClass)
              continue;

            // Filter check (evaluateFilter returns false if "Removed" by filter)
            if (!evaluateFilter(rule.filter, region, true)) {
              targets.push(region.id);
            }
          }

          // Apply changes
          targets.forEach((id) => {
            next.set(id, rule.toClass);
          });
        });

      return next;
    });

    setSaveMessage({
      type: "success",
      text: "Pipeline executed successfully.",
    });
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // --- Manual Actions ---

  const handleAddRegion = (points: { x: number; y: number }[]) => {
    const id = -1 * Date.now();
    const bbox = calculateBBox(points);
    const newRegion: AnnotationRegion = {
      id,
      bbox,
      points,
      metrics: {},
      isManualAdded: true,
      categoryId: activeCategory,
    };
    setAddedRegions((prev) => [...prev, newRegion]);
  };

  const handleRemoveAddedRegion = (id: number) => {
    setAddedRegions((prev) => prev.filter((r) => r.id !== id));
  };

  const handleUpdateRoot = (newRoot: FilterGroup) => {
    setFilterConfig((prev) => ({
      ...prev,
      root: { ...newRoot, enabled: true },
    }));
  };

  const handleSave = () => {
    setSaveMessage(null);
    startTransition(async () => {
      const classObj = Object.fromEntries(classifications);
      const classResult = await saveClassifications(classObj);

      const configToSave: FilterConfig = {
        ...filterConfig,
        excludedIds: Array.from(filteredIds),
      };
      const filterResult = await saveFilterConfig(configToSave);

      const addResult = await saveAddedAnnotations(addedRegions);

      if (classResult.success && filterResult.success && addResult.success) {
        setSaveMessage({
          type: "success",
          text: "All changes saved successfully.",
        });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const errorMsgs = [];
        if (!classResult.success) errorMsgs.push(classResult.message);
        if (!filterResult.success) errorMsgs.push(filterResult.message);
        if (!addResult.success) errorMsgs.push(addResult.message);
        setSaveMessage({
          type: "error",
          text: `Save failed: ${errorMsgs.join(", ")}`,
        });
      }
    });
  };

  const removedCount = Array.from(classifications.values()).filter(
    (c) => c === 999,
  ).length;

  const handleBulkClassify = (targetClassId: number) => {
    setClassifications((prev) => {
      const next = new Map(prev);
      filteredIds.forEach((id) => {
        next.set(id, targetClassId);
      });
      return next;
    });

    setFilterConfig((prev) => ({
      ...prev,
      root: { ...prev.root, enabled: false },
    }));

    setSaveMessage({
      type: "success",
      text: `Applied Class ${targetClassId} to ${filteredIds.size} regions and reset filter.`,
    });
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // --- Category Management ---

  const handleAddCategory = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    const ids = categories.map((c) => c.id);
    const maxId = ids.length > 0 ? Math.max(...ids) : 0;
    let newId = maxId + 1;
    if (newId === 999) newId = 1000;

    const hue = Math.floor(Math.random() * 360);
    const color = `hsl(${hue}, 70%, 50%)`;
    const fill = `hsla(${hue}, 70%, 50%, 0.25)`;

    const newCat: CategoryDef = {
      id: newId,
      name: `Class ${newId}`,
      color,
      fill,
    };

    const nextCategories = [...categories, newCat];
    setCategories(nextCategories);
    startTransition(async () => {
      await saveCategories(nextCategories);
    });
  };

  const handleUpdateCategoryColor = (id: number, color: string) => {
    // Hex to RGBA
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    const fill = `rgba(${r}, ${g}, ${b}, 0.25)`;

    const newCategories = categories.map((c) =>
      c.id === id ? { ...c, color, fill } : c,
    );

    setCategories(newCategories);
    setEditingColorId(null);

    startTransition(async () => {
      await saveCategories(newCategories);
    });
  };

  const handleDeleteCategory = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();

    // 1. System check
    const target = categories.find((c) => c.id === id);
    if (target?.isSystem) {
      alert("Cannot delete system category.");
      return;
    }

    // 2. Usage check
    const usedInClassifications = Array.from(classifications.values()).includes(
      id,
    );
    const usedInAdditions = addedRegions.some((r) => r.categoryId === id);
    const usedInInitial = initialRegions.some((r) => r.categoryId === id);

    if (usedInClassifications || usedInAdditions || usedInInitial) {
      alert("Cannot delete category: It is currently in use.");
      return;
    }

    if (!confirm(`Delete category "${target?.name}"?`)) return;

    const newCategories = categories.filter((c) => c.id !== id);
    setCategories(newCategories);

    if (activeCategory === id) setActiveCategory(999);

    startTransition(async () => {
      await saveCategories(newCategories);
    });
  };

  // --- Preset Handlers ---

  const handleSavePreset = () => {
    const name = window.prompt(
      "Enter preset name (e.g., 'Remove Small Debris'):",
      "",
    );
    if (!name) return;

    const newPreset: FilterPreset = {
      id: crypto.randomUUID(),
      name,
      config: filterConfig,
    };

    startTransition(async () => {
      const result = await saveFilterPreset(newPreset);
      if (result.success) {
        setPresets(result.presets);
        setSaveMessage({ type: "success", text: "Preset saved." });
        setTimeout(() => setSaveMessage(null), 2000);
        setSelectedPresetId(newPreset.id);
      } else {
        alert(result.message);
      }
    });
  };

  const handleLoadPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (preset) {
      setFilterConfig({ ...preset.config, version: 3 });
      setSaveMessage({
        type: "success",
        text: `Loaded preset: ${preset.name}`,
      });
      setTimeout(() => setSaveMessage(null), 2000);
    }
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId) return;
    // eslint-disable-next-line no-alert
    if (!confirm("Are you sure you want to delete this preset?")) return;

    startTransition(async () => {
      const result = await deleteFilterPreset(selectedPresetId);
      if (result.success) {
        setPresets(result.presets);
        setSelectedPresetId("");
        setSaveMessage({ type: "success", text: "Preset deleted." });
        setTimeout(() => setSaveMessage(null), 2000);
      } else {
        alert(result.message);
      }
    });
  };

  return (
    <div
      className={css({ padding: "8", maxWidth: "1600px", margin: "0 auto" })}
    >
      <div
        className={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "6",
        })}
      >
        <h1
          className={css({
            fontSize: "2xl",
            fontWeight: "bold",
            color: "gray.900",
          })}
        >
          Annotation Tool V2 (Classification Pipeline)
        </h1>
      </div>

      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "1fr 400px",
          gap: "8",
          alignItems: "start",
        })}
      >
        {/* Main Canvas Area */}
        <div
          className={css({
            backgroundColor: "gray.50",
            padding: "4",
            borderRadius: "xl",
            border: "1px solid token(colors.gray.200)",
          })}
        >
          <CanvasLayer
            imageSrc={imageUrl}
            width={1200}
            height={900}
            regions={allRegions}
            filteredIds={filteredIds}
            classifications={classifications}
            activeCategory={activeCategory}
            categoryMap={categoryMap}
            hoveredId={hoveredId}
            editMode={editMode}
            onHover={setHoveredId}
            onClick={handleRegionClick}
            onRangeSelect={handleRangeSelect}
            onAddRegion={handleAddRegion}
          />
          <div
            className={css({
              marginTop: "4",
              fontSize: "sm",
              color: "gray.700",
            })}
          >
            Total: {allRegions.length} (Added: {addedRegions.length}) | Target
            (Filtered): {filteredIds.size} | Removed(999): {removedCount}
          </div>
        </div>

        {/* Sidebar Controls */}
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "6",
          })}
        >
          {/* Mode Switch */}
          <div
            className={css({
              padding: "4",
              backgroundColor: "white",
              borderRadius: "xl",
              border: "1px solid token(colors.gray.200)",
              boxShadow: "sm",
            })}
          >
            <div className={css({ display: "flex", gap: "2" })}>
              <button
                type="button"
                onClick={() => setEditMode("select")}
                className={css({
                  flex: 1,
                  padding: "2",
                  borderRadius: "md",
                  fontSize: "sm",
                  fontWeight: "semibold",
                  cursor: "pointer",
                  backgroundColor:
                    editMode === "select" ? "blue.600" : "gray.200",
                  color: editMode === "select" ? "white" : "gray.800",
                  "&:hover": { opacity: 0.9 },
                })}
              >
                Pipeline / Classify
              </button>
              <button
                type="button"
                onClick={() => setEditMode("draw")}
                className={css({
                  flex: 1,
                  padding: "2",
                  borderRadius: "md",
                  fontSize: "sm",
                  fontWeight: "semibold",
                  cursor: "pointer",
                  backgroundColor:
                    editMode === "draw" ? "blue.600" : "gray.200",
                  color: editMode === "draw" ? "white" : "gray.800",
                  "&:hover": { opacity: 0.9 },
                })}
              >
                Draw (Add)
              </button>
            </div>
          </div>

          {/* === SELECT MODE: PIPELINE EDITOR === */}
          {editMode === "select" && (
            <div
              className={css({
                padding: "4",
                backgroundColor: "white",
                borderRadius: "xl",
                border: "1px solid token(colors.gray.200)",
                boxShadow: "sm",
              })}
            >
              <h3
                className={css({
                  fontSize: "md",
                  fontWeight: "bold",
                  marginBottom: "4",
                  color: "gray.900",
                  borderBottom: "1px solid token(colors.gray.200)",
                  paddingBottom: "2",
                })}
              >
                Rule Editor
              </h3>

              {/* 1. Class Selection */}
              <div className={css({ marginBottom: "6" })}>
                <div
                  className={css({
                    display: "grid",
                    gridTemplateColumns: "1fr 20px 1fr",
                    gap: "2",
                    alignItems: "center",
                  })}
                >
                  {/* From Class */}
                  <div>
                    <label
                      className={css({
                        fontSize: "xs",
                        fontWeight: "bold",
                        color: "gray.700",
                        display: "block",
                        marginBottom: "1",
                      })}
                    >
                      From Class
                    </label>
                    <select
                      className={css({
                        width: "100%",
                        padding: "2",
                        borderRadius: "md",
                        border: "1px solid token(colors.gray.300)",
                        fontSize: "sm",
                        cursor: "pointer",
                        backgroundColor: "white",
                        color: "gray.900",
                      })}
                      value={fromClassId}
                      onChange={(e) =>
                        setFromClassId(
                          e.target.value === "any"
                            ? "any"
                            : Number(e.target.value),
                        )
                      }
                    >
                      <option value="any">Any Class</option>
                      {categories.map((def) => (
                        <option key={def.id} value={def.id}>
                          {def.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div
                    className={css({
                      textAlign: "center",
                      color: "gray.500",
                      paddingTop: "4",
                    })}
                  >
                    →
                  </div>

                  {/* To Class */}
                  <div>
                    <label
                      className={css({
                        fontSize: "xs",
                        fontWeight: "bold",
                        color: "gray.700",
                        display: "block",
                        marginBottom: "1",
                      })}
                    >
                      To Class (Action)
                    </label>
                    <select
                      className={css({
                        width: "100%",
                        padding: "2",
                        borderRadius: "md",
                        border: "1px solid token(colors.gray.300)",
                        fontSize: "sm",
                        cursor: "pointer",
                        fontWeight: "bold",
                        backgroundColor: "white",
                        color: "gray.900",
                      })}
                      style={{
                        color: categoryMap[activeCategory]?.color,
                      }}
                      value={activeCategory}
                      onChange={(e) =>
                        setActiveCategory(Number(e.target.value))
                      }
                    >
                      {categories.map((def) => (
                        <option key={def.id} value={def.id}>
                          {def.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* New Class Button */}
                <div className={css({ marginTop: "2", textAlign: "right" })}>
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className={css({
                      fontSize: "xs",
                      color: "blue.600",
                      fontWeight: "bold",
                      cursor: "pointer",
                      "&:hover": { textDecoration: "underline" },
                    })}
                  >
                    + New Class
                  </button>
                </div>
              </div>

              {/* 2. Filter Conditions & Presets */}
              <div className={css({ marginBottom: "4" })}>
                <div
                  className={css({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "2",
                  })}
                >
                  <label
                    className={css({
                      fontSize: "xs",
                      fontWeight: "bold",
                      color: "gray.700",
                    })}
                  >
                    Condition (Filter)
                  </label>

                  {/* Preset Controls */}
                  <div className={css({ display: "flex", gap: "2" })}>
                    <select
                      className={css({
                        padding: "1px 4px",
                        fontSize: "xs",
                        borderRadius: "sm",
                        border: "1px solid token(colors.gray.300)",
                        maxWidth: "140px",
                        backgroundColor: "white",
                        color: "gray.900",
                      })}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          setSelectedPresetId(val);
                          handleLoadPreset(val);
                        } else {
                          setSelectedPresetId("");
                        }
                      }}
                      value={selectedPresetId}
                    >
                      <option value="">Load Preset...</option>
                      {presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleDeletePreset}
                      disabled={!selectedPresetId}
                      className={css({
                        fontSize: "xs",
                        color: "red.600",
                        cursor: "pointer",
                        fontWeight: "bold",
                        opacity: selectedPresetId ? 1 : 0.3,
                        pointerEvents: selectedPresetId ? "auto" : "none",
                        "&:hover": { textDecoration: "underline" },
                      })}
                    >
                      Del
                    </button>

                    <button
                      type="button"
                      onClick={handleSavePreset}
                      className={css({
                        fontSize: "xs",
                        color: "blue.600",
                        cursor: "pointer",
                        fontWeight: "bold",
                        "&:hover": { textDecoration: "underline" },
                      })}
                    >
                      Save New
                    </button>
                  </div>
                </div>

                <div
                  className={css({
                    border: "1px solid token(colors.gray.200)",
                    borderRadius: "md",
                    padding: "2",
                    backgroundColor: "gray.50",
                  })}
                >
                  <ControlPanel
                    stats={stats}
                    rootGroup={filterConfig.root}
                    maxDepth={filterConfig.maxDepth}
                    onUpdateRoot={handleUpdateRoot}
                  />
                </div>
              </div>

              {/* 3. Add Rule Button */}
              <button
                type="button"
                onClick={handleAddRule}
                className={css({
                  width: "100%",
                  padding: "3",
                  backgroundColor: "white",
                  color: "blue.600",
                  border: "1px solid token(colors.blue.600)",
                  borderRadius: "md",
                  fontSize: "sm",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginBottom: "4",
                  "&:hover": { backgroundColor: "blue.50" },
                })}
              >
                + Add to Pipeline
              </button>

              {/* Pipeline List */}
              <div
                className={css({
                  borderTop: "1px solid token(colors.gray.200)",
                  paddingTop: "4",
                })}
              >
                <div
                  className={css({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "2",
                  })}
                >
                  <h4
                    className={css({
                      fontSize: "sm",
                      fontWeight: "bold",
                      color: "gray.800",
                    })}
                  >
                    Execution Pipeline
                  </h4>
                  <button
                    type="button"
                    onClick={handleRunPipeline}
                    disabled={rules.length === 0}
                    className={css({
                      padding: "4px 8px",
                      backgroundColor: "blue.600",
                      color: "white",
                      borderRadius: "md",
                      fontSize: "xs",
                      fontWeight: "bold",
                      cursor: "pointer",
                      opacity: rules.length === 0 ? 0.5 : 1,
                      "&:hover": { backgroundColor: "blue.700" },
                    })}
                  >
                    Run All Rules
                  </button>
                </div>

                {rules.length === 0 ? (
                  <div
                    className={css({
                      fontSize: "xs",
                      color: "gray.500",
                      textAlign: "center",
                      padding: "4",
                    })}
                  >
                    No rules defined.
                  </div>
                ) : (
                  <ul
                    className={css({
                      display: "flex",
                      flexDirection: "column",
                      gap: "2",
                    })}
                  >
                    {rules.map((rule, index) => (
                      <li
                        key={rule.id}
                        className={css({
                          padding: "2",
                          backgroundColor: "gray.50",
                          borderRadius: "md",
                          border: "1px solid token(colors.gray.200)",
                          display: "flex",
                          alignItems: "center",
                          gap: "2",
                        })}
                      >
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => handleToggleRule(rule.id)}
                          className={css({ cursor: "pointer" })}
                        />
                        <div className={css({ flex: 1, minWidth: 0 })}>
                          <div
                            className={css({
                              fontSize: "xs",
                              fontWeight: "bold",
                              color: "gray.800",
                            })}
                          >
                            {rule.name}
                          </div>
                          <div
                            className={css({
                              fontSize: "xs",
                              color: "gray.500",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            })}
                          >
                            {rule.fromClass === "any"
                              ? "Any"
                              : categoryMap[Number(rule.fromClass)]?.name}{" "}
                            → {categoryMap[rule.toClass]?.name}
                          </div>
                        </div>
                        <div
                          className={css({
                            display: "flex",
                            flexDirection: "column",
                          })}
                        >
                          <button
                            type="button"
                            onClick={() => handleMoveRule(index, -1)}
                            disabled={index === 0}
                            className={css({
                              fontSize: "10px",
                              color: "gray.600",
                              cursor: "pointer",
                              "&:hover": { color: "blue.600" },
                              "&:disabled": { opacity: 0.3 },
                            })}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveRule(index, 1)}
                            disabled={index === rules.length - 1}
                            className={css({
                              fontSize: "10px",
                              color: "gray.600",
                              cursor: "pointer",
                              "&:hover": { color: "blue.600" },
                              "&:disabled": { opacity: 0.3 },
                            })}
                          >
                            ▼
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(rule.id)}
                          className={css({
                            color: "red.500",
                            fontSize: "sm",
                            cursor: "pointer",
                            padding: "2px",
                            "&:hover": { backgroundColor: "red.50" },
                          })}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* === DRAW MODE: MANUAL TOOLS === */}
          {editMode === "draw" && (
            <div
              className={css({
                padding: "4",
                backgroundColor: "white",
                borderRadius: "xl",
                border: "1px solid token(colors.gray.200)",
                boxShadow: "sm",
              })}
            >
              <h3
                className={css({
                  fontWeight: "bold",
                  marginBottom: "4",
                  color: "gray.900",
                })}
              >
                Draw Tools
              </h3>

              {/* Active Category Palette */}
              <div className={css({ marginBottom: "4" })}>
                <div
                  className={css({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  })}
                >
                  <h4 className={css({ fontSize: "xs", color: "gray.700" })}>
                    Active Category
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className={css({
                      fontSize: "xs",
                      color: "blue.600",
                      fontWeight: "bold",
                      cursor: "pointer",
                      "&:hover": { textDecoration: "underline" },
                    })}
                  >
                    + New
                  </button>
                </div>
                <div
                  className={css({
                    marginTop: "2",
                    display: "grid",
                    gap: "2",
                  })}
                >
                  {categories.map((def) => {
                    const isActive = activeCategory === def.id;
                    return (
                      <div
                        key={def.id}
                        className={css({
                          position: "relative",
                        })}
                      >
                        <label
                          className={css({
                            display: "flex",
                            alignItems: "center",
                            gap: "2",
                            padding: "2",
                            borderRadius: "md",
                            cursor: "pointer",
                            backgroundColor: isActive
                              ? "gray.100"
                              : "transparent",
                            border: isActive
                              ? "1px solid token(colors.gray.300)"
                              : "1px solid transparent",
                          })}
                        >
                          <input
                            type="radio"
                            name="drawCategory"
                            value={def.id}
                            checked={isActive}
                            onChange={() => setActiveCategory(def.id)}
                            className={css({ cursor: "pointer" })}
                          />
                          <button
                            type="button"
                            className={css({
                              width: "16px",
                              height: "16px",
                              borderRadius: "full",
                              cursor: "pointer",
                              border: "1px solid rgba(0,0,0,0.1)",
                              padding: 0,
                              appearance: "none",
                            })}
                            style={{ backgroundColor: def.color }}
                            onClick={(e) => {
                              e.preventDefault(); // Stop radio click
                              setEditingColorId(
                                editingColorId === def.id ? null : def.id,
                              );
                            }}
                          />
                          <span
                            className={css({
                              fontSize: "sm",
                              fontWeight: isActive ? "bold" : "normal",
                              color: "gray.900",
                              flex: 1,
                              marginLeft: "4px",
                            })}
                          >
                            {def.name}
                          </span>

                          {!def.isSystem && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCategory(e, def.id)}
                              className={css({
                                fontSize: "10px",
                                color: "gray.400",
                                cursor: "pointer",
                                padding: "2px",
                                marginLeft: "4px",
                                backgroundColor: "transparent",
                                border: "none",
                                "&:hover": { color: "red.500" },
                              })}
                            >
                              ✕
                            </button>
                          )}
                        </label>

                        {/* Color Picker Popover */}
                        {editingColorId === def.id && (
                          <div
                            className={css({
                              position: "absolute",
                              top: "100%",
                              left: 0,
                              zIndex: 10,
                              backgroundColor: "white",
                              border: "1px solid token(colors.gray.300)",
                              borderRadius: "md",
                              padding: "4px",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "4px",
                              width: "140px",
                              boxShadow: "lg",
                            })}
                          >
                            {PRESET_COLORS.map((c) => (
                              <button
                                type="button"
                                key={c}
                                className={css({
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  padding: 0,
                                  border: "none",
                                  "&:hover": { transform: "scale(1.1)" },
                                })}
                                style={{ backgroundColor: c }}
                                onClick={() =>
                                  handleUpdateCategoryColor(def.id, c)
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Added List */}
              <h4
                className={css({
                  fontSize: "xs",
                  color: "gray.700",
                  marginBottom: "2",
                })}
              >
                Added Regions
              </h4>
              {addedRegions.length === 0 ? (
                <div className={css({ color: "gray.500", fontSize: "sm" })}>
                  No additions.
                </div>
              ) : (
                <ul
                  className={css({
                    maxHeight: "200px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1",
                  })}
                >
                  {addedRegions.map((region, index) => (
                    <li
                      key={region.id}
                      className={css({
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "2",
                        fontSize: "xs",
                        color: "gray.800",
                        borderBottom: "1px solid #eee",
                      })}
                    >
                      <span>
                        #{index + 1} (
                        {categoryMap[region.categoryId ?? 1]?.name})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAddedRegion(region.id)}
                        className={css({
                          color: "red.600",
                          cursor: "pointer",
                          fontWeight: "bold",
                        })}
                      >
                        Del
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Global Save */}
          <div
            className={css({
              padding: "4",
              backgroundColor: "white",
              borderRadius: "xl",
              border: "1px solid token(colors.gray.200)",
              boxShadow: "sm",
            })}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={css({
                width: "100%",
                padding: "3",
                backgroundColor: isSaving ? "gray.400" : "green.600",
                color: "white",
                borderRadius: "md",
                fontWeight: "semibold",
                cursor: isSaving ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
                "&:hover": {
                  backgroundColor: isSaving ? "gray.400" : "green.700",
                },
              })}
            >
              {isSaving ? "Saving..." : "Save All Changes"}
            </button>
            {saveMessage && (
              <div
                className={css({
                  marginTop: "3",
                  fontSize: "sm",
                  color:
                    saveMessage.type === "success" ? "green.600" : "red.600",
                  fontWeight: "medium",
                  textAlign: "center",
                })}
              >
                {saveMessage.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
