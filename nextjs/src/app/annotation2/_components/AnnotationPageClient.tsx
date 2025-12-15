"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { css } from "../../../../styled-system/css";
import {
  createDefaultConfig,
  evaluateFilter,
  getFilterExpression,
} from "../_lib/filter-utils";
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
  saveManualClassifications,
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
  initialManualClassifications?: Record<number, number>; // New: Manual Overrides
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
  initialManualClassifications = {},
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

  // 1. Pipeline Results (Calculated from rules)
  // Initially loaded from classification.json (legacy/merged data)
  const [pipelineResults, setPipelineResults] = useState<Map<number, number>>(
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

  // 2. Manual Overrides (Hand-picked by user) - Highest Priority
  // Persisted in manual_classifications.json
  const [manualOverrides, setManualOverrides] = useState<Map<number, number>>(
    () => {
      const map = new Map<number, number>();
      Object.entries(initialManualClassifications).forEach(([id, cat]) => {
        map.set(Number(id), Number(cat));
      });
      return map;
    },
  );

  // 3. Merged Classifications (For Display)
  // Logic: Manual Overrides > Pipeline Results > Default
  const mergedClassifications = useMemo(() => {
    const merged = new Map(pipelineResults);
    manualOverrides.forEach((cat, id) => {
      merged.set(id, cat);
    });
    return merged;
  }, [pipelineResults, manualOverrides]);

  const [presets, setPresets] = useState<FilterPreset[]>(initialPresets);
  const [rules, setRules] = useState<ClassificationRule[]>(initialRules);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

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

  const editingRule = useMemo(
    () => (editingRuleId ? rules.find((r) => r.id === editingRuleId) ?? null : null),
    [editingRuleId, rules],
  );

  const allRegions = useMemo(() => {
    return [...initialRegions, ...addedRegions];
  }, [initialRegions, addedRegions]);

  const filteredIds = useMemo(() => {
    const ids = new Set<number>();
    if (!filterConfig.root.enabled) return ids;

    for (const region of allRegions) {
      // Use merged classifications for visibility filtering
      const currentCat =
        mergedClassifications.get(region.id) ?? region.categoryId ?? 1;
      if (fromClassId !== "any" && currentCat !== fromClassId) {
        continue;
      }
      if (!evaluateFilter(filterConfig.root, region)) {
        ids.add(region.id);
      }
    }
    return ids;
  }, [allRegions, filterConfig, mergedClassifications, fromClassId]);

  // --- Manual Edit Handlers (Update Manual Overrides) ---

  const handleRegionClick = (id: number) => {
    const target = allRegions.find((r) => r.id === id);
    if (target?.isManualAdded) return;

    setManualOverrides((prev) => {
      const next = new Map(prev);
      const currentCat = mergedClassifications.get(id); // Check current visual state

      if (currentCat === activeCategory) {
        // Toggle OFF: If currently active category, remove explicit override.
        // This falls back to Pipeline result.
        // If we want to "Reset to Default", we might need to explicitly set to 1?
        // But "Toggle" usually means "Remove my manual choice".
        next.delete(id);
      } else {
        // Apply Override
        next.set(id, activeCategory);
      }

      // Real-time Save for Manual Overrides
      startTransition(async () => {
        await saveManualClassifications(Object.fromEntries(next));
      });

      return next;
    });
  };

  const handleRangeSelect = (ids: number[]) => {
    setManualOverrides((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => {
        const target = allRegions.find((r) => r.id === id);
        if (target?.isManualAdded) return;
        next.set(id, activeCategory);
      });

      // Real-time Save
      startTransition(async () => {
        await saveManualClassifications(Object.fromEntries(next));
      });

      return next;
    });
  };

  // --- Pipeline Management (Update Pipeline Results) ---

  const recalculateClassifications = useCallback(
    (currentRules: ClassificationRule[]) => {
      // Start fresh to allow "real-time" toggling
      const next = new Map<number, number>();

      // Apply all enabled rules sequentially
      currentRules
        .filter((r) => r.enabled)
        .forEach((rule) => {
          // Find matching regions
          const targets: number[] = [];
          for (const region of allRegions) {
            // Check current class (affected by previous rules in this loop)
            const currentCat = next.get(region.id) ?? region.categoryId ?? 1;

            if (rule.fromClass !== "any" && currentCat !== rule.fromClass)
              continue;

            // Evaluate with Keep/Remove semantics to align with UI preview
            // "Target" = items that would be filtered out (i.e., !passes)
            const passes = evaluateFilter(rule.filter, region, true);
            if (!passes) {
              targets.push(region.id);
            }
          }

          // Apply changes
          targets.forEach((id) => {
            next.set(id, rule.toClass);
          });
        });

      setPipelineResults(next);
      // NOTE: Manual Overrides are NOT touched here, so they persist!
    },
    [allRegions],
  );

  const updateRules = (newRules: ClassificationRule[]) => {
    setRules(newRules);
    recalculateClassifications(newRules);
  };

  const handleEditRule = (ruleId: string) => {
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;

    setEditingRuleId(ruleId);
    setFromClassId(target.fromClass);
    setActiveCategory(target.toClass);

    const copied = JSON.parse(JSON.stringify(target.filter)) as FilterGroup;
    setFilterConfig((prev) => ({
      ...prev,
      root: { ...copied, enabled: true },
    }));
  };

  const handleCancelEditRule = () => {
    setEditingRuleId(null);
  };

  const handleAddRule = () => {
    const filterCopy = JSON.parse(JSON.stringify(filterConfig.root)) as FilterGroup;
    filterCopy.enabled = true;

    if (editingRuleId) {
      const updatedRules = rules.map((r) =>
        r.id === editingRuleId
          ? {
              ...r,
              fromClass: fromClassId,
              toClass: activeCategory,
              filter: filterCopy,
            }
          : r,
      );
      updateRules(updatedRules);
      setEditingRuleId(null);
      setSaveMessage({
        type: "success",
        text: "Rule updated.",
      });
      setTimeout(() => setSaveMessage(null), 2000);
      return;
    }

    const name = window.prompt("Rule Name:", `Rule ${rules.length + 1}`);
    if (!name) return;

    const newRule: ClassificationRule = {
      id: crypto.randomUUID(),
      name,
      enabled: true,
      fromClass: fromClassId,
      toClass: activeCategory,
      filter: filterCopy, // Deep copy
    };

    updateRules([...rules, newRule]);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!confirm("Delete this rule?")) return;
    if (editingRuleId === ruleId) {
      setEditingRuleId(null);
    }
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
    recalculateClassifications(rules);
    setSaveMessage({
      type: "success",
      text: "Pipeline executed successfully.",
    });
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // --- Manual Actions (Add/Remove Regions) ---

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
      // Save merged results as the "final" classification for export
      const classObj = Object.fromEntries(mergedClassifications);
      const classResult = await saveClassifications(classObj);

      const configToSave: FilterConfig = {
        ...filterConfig,
        excludedIds: Array.from(filteredIds),
      };
      const filterResult = await saveFilterConfig(configToSave);

      const addResult = await saveAddedAnnotations(addedRegions);

      const pipelineResult = await savePipeline(rules);

      // Manual overrides are already saved in real-time, but let's save again to be sure
      const manualResult = await saveManualClassifications(
        Object.fromEntries(manualOverrides),
      );

      if (
        classResult.success &&
        filterResult.success &&
        addResult.success &&
        pipelineResult.success &&
        manualResult.success
      ) {
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
        if (!pipelineResult.success) errorMsgs.push(pipelineResult.message);
        if (!manualResult.success) errorMsgs.push(manualResult.message);
        setSaveMessage({
          type: "error",
          text: `Save failed: ${errorMsgs.join(", ")}`,
        });
      }
    });
  };

  const removedCount = Array.from(mergedClassifications.values()).filter(
    (c) => c === 999,
  ).length;

  const handleBulkClassify = (targetClassId: number) => {
    // Bulk classify applies to MANUAL OVERRIDES for safety?
    // Or just pipeline?
    // "Bulk Action" usually implies manual intervention on filtered set.
    // So let's update Manual Overrides.
    setManualOverrides((prev) => {
      const next = new Map(prev);
      filteredIds.forEach((id) => {
        next.set(id, targetClassId);
      });

      startTransition(async () => {
        await saveManualClassifications(Object.fromEntries(next));
      });

      return next;
    });

    setFilterConfig((prev) => ({
      ...prev,
      root: { ...prev.root, enabled: false },
    }));

    setSaveMessage({
      type: "success",
      text: `Applied Class ${targetClassId} to ${filteredIds.size} regions (Manual Override).`,
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
    const usedInClassifications = Array.from(
      mergedClassifications.values(),
    ).includes(id);
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
            classifications={mergedClassifications}
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
                  backgroundColor: editingRuleId ? "blue.700" : "white",
                  color: editingRuleId ? "white" : "blue.600",
                  border: "1px solid token(colors.blue.600)",
                  borderRadius: "md",
                  fontSize: "sm",
                  fontWeight: "bold",
                  cursor: "pointer",
                  marginBottom: "4",
                  "&:hover": {
                    backgroundColor: editingRuleId ? "blue.800" : "blue.50",
                  },
                })}
              >
                {editingRuleId ? "Update Rule" : "+ Add to Pipeline"}
              </button>
              {editingRule && (
                <div
                  className={css({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "xs",
                    color: "gray.600",
                    marginTop: "-2",
                    marginBottom: "4",
                  })}
                >
                  <span>
                    Editing: <strong>{editingRule.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelEditRule}
                    className={css({
                      color: "red.500",
                      fontWeight: "bold",
                      cursor: "pointer",
                      "&:hover": { textDecoration: "underline" },
                    })}
                  >
                    Cancel
                  </button>
                </div>
              )}

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
                          alignItems: "flex-start",
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
                          <div
                            className={css({
                              fontSize: "xs",
                              color: "gray.500",
                              lineHeight: "1.3",
                              marginTop: "1",
                            })}
                          >
                            {getFilterExpression(rule.filter) ||
                              "No active filters"}
                          </div>
                        </div>
                        <div
                          className={css({
                            display: "flex",
                            alignItems: "center",
                            gap: "1.5",
                          })}
                        >
                          <button
                            type="button"
                            onClick={() => handleEditRule(rule.id)}
                            className={css({
                              fontSize: "xs",
                              color: "blue.600",
                              cursor: "pointer",
                              fontWeight: "bold",
                              padding: "2px 4px",
                              borderRadius: "sm",
                              "&:hover": { backgroundColor: "blue.50" },
                            })}
                          >
                            Edit
                          </button>
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
                              borderRadius: "sm",
                              "&:hover": { backgroundColor: "red.50" },
                            })}
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* === DRAW MODE: CLASS MANAGER === */}
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
                  fontSize: "md",
                  fontWeight: "bold",
                  marginBottom: "4",
                  color: "gray.900",
                  borderBottom: "1px solid token(colors.gray.200)",
                  paddingBottom: "2",
                })}
              >
                Class Manager (Draw)
              </h3>

              <div
                className={css({
                  marginBottom: "4",
                  fontSize: "sm",
                  color: "gray.600",
                })}
              >
                Click on the image to add polygon points. Double-click or click
                start point to close.
              </div>

              {/* Active Class Select */}
              <div className={css({ marginBottom: "6" })}>
                <label
                  className={css({
                    fontSize: "xs",
                    fontWeight: "bold",
                    color: "gray.700",
                    display: "block",
                    marginBottom: "2",
                  })}
                >
                  Active Class (for new regions)
                </label>
                <select
                  className={css({
                    width: "100%",
                    padding: "2",
                    borderRadius: "md",
                    border: "1px solid token(colors.gray.300)",
                    fontSize: "sm",
                    fontWeight: "bold",
                    cursor: "pointer",
                    backgroundColor: "white",
                    color: "gray.900",
                  })}
                  style={{
                    color: categoryMap[activeCategory]?.color,
                  }}
                  value={activeCategory}
                  onChange={(e) => setActiveCategory(Number(e.target.value))}
                >
                  {categories.map((def) => (
                    <option key={def.id} value={def.id}>
                      {def.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAddCategory}
                  className={css({
                    marginTop: "2",
                    width: "100%",
                    padding: "2",
                    fontSize: "xs",
                    backgroundColor: "gray.100",
                    color: "blue.600",
                    fontWeight: "bold",
                    borderRadius: "md",
                    cursor: "pointer",
                    "&:hover": { backgroundColor: "gray.200" },
                  })}
                >
                  + Add New Class
                </button>
              </div>

              {/* Class List & Color Edit */}
              <div className={css({ borderTop: "1px solid token(colors.gray.200)", paddingTop: "4" })}>
                <h4 className={css({ fontSize: "sm", fontWeight: "bold", marginBottom: "2", color: "gray.800" })}>
                  Edit Classes
                </h4>
                <ul className={css({ display: "flex", flexDirection: "column", gap: "2" })}>
                  {categories.map((cat) => (
                    <li
                      key={cat.id}
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "2",
                        borderRadius: "md",
                        backgroundColor: activeCategory === cat.id ? "blue.50" : "transparent",
                        border: activeCategory === cat.id ? "1px solid token(colors.blue.200)" : "1px solid transparent",
                      })}
                    >
                      <div className={css({ display: "flex", alignItems: "center", gap: "2" })}>
                        {/* Color Box */}
                        <div
                          className={css({
                            width: "16px",
                            height: "16px",
                            borderRadius: "sm",
                            cursor: "pointer",
                            border: "1px solid rgba(0,0,0,0.1)",
                          })}
                          style={{ backgroundColor: cat.color }}
                          onClick={() => setEditingColorId(editingColorId === cat.id ? null : cat.id)}
                        />
                        <span
                          className={css({
                            fontSize: "xs",
                            fontWeight: "medium",
                            color: "gray.800",
                            cursor: "pointer",
                          })}
                          onClick={() => setActiveCategory(cat.id)}
                        >
                          {cat.name}
                        </span>
                      </div>

                      {!cat.isSystem && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCategory(e, cat.id)}
                          className={css({
                            fontSize: "xs",
                            color: "gray.400",
                            cursor: "pointer",
                            "&:hover": { color: "red.500" },
                          })}
                        >
                          Trash
                        </button>
                      )}

                      {/* Color Picker Popover (Inline) */}
                      {editingColorId === cat.id && (
                        <div
                          className={css({
                            position: "absolute",
                            marginTop: "24px",
                            padding: "2",
                            backgroundColor: "white",
                            border: "1px solid token(colors.gray.300)",
                            borderRadius: "md",
                            boxShadow: "lg",
                            zIndex: 10,
                            display: "grid",
                            gridTemplateColumns: "repeat(6, 1fr)",
                            gap: "1",
                          })}
                        >
                          {PRESET_COLORS.map((c) => (
                            <div
                              key={c}
                              className={css({
                                width: "16px",
                                height: "16px",
                                cursor: "pointer",
                                borderRadius: "sm",
                                "&:hover": { transform: "scale(1.2)" },
                              })}
                              style={{ backgroundColor: c }}
                              onClick={() => handleUpdateCategoryColor(cat.id, c)}
                            />
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Added Regions Queue */}
              <div
                className={css({
                  borderTop: "1px solid token(colors.gray.200)",
                  paddingTop: "4",
                  marginTop: "4",
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
                    Added Regions Queue ({addedRegions.length})
                  </h4>
                  {addedRegions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("Clear all manually added regions?")) {
                          setAddedRegions([]);
                        }
                      }}
                      className={css({
                        fontSize: "xs",
                        color: "red.600",
                        cursor: "pointer",
                        fontWeight: "bold",
                        "&:hover": { textDecoration: "underline" },
                      })}
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {addedRegions.length === 0 ? (
                  <div
                    className={css({
                      fontSize: "xs",
                      color: "gray.500",
                      fontStyle: "italic",
                    })}
                  >
                    No manual regions added yet.
                  </div>
                ) : (
                  <ul
                    className={css({
                      display: "flex",
                      flexDirection: "column",
                      gap: "2",
                      maxHeight: "200px",
                      overflowY: "auto",
                    })}
                  >
                    {addedRegions.map((region, idx) => (
                      <li
                        key={region.id}
                        className={css({
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "2",
                          backgroundColor: "gray.50",
                          borderRadius: "md",
                          border: "1px solid token(colors.gray.200)",
                        })}
                      >
                        <div
                          className={css({
                            display: "flex",
                            flexDirection: "column",
                          })}
                        >
                          <span
                            className={css({
                              fontSize: "xs",
                              fontWeight: "bold",
                              color: "gray.800",
                            })}
                          >
                            Region #{idx + 1}
                          </span>
                          <span
                            className={css({
                              fontSize: "xs",
                              color: "gray.500",
                            })}
                          >
                            {categoryMap[region.categoryId ?? 1]?.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAddedRegion(region.id)}
                          className={css({
                            color: "red.500",
                            fontSize: "sm",
                            cursor: "pointer",
                            padding: "2px",
                            "&:hover": {
                              backgroundColor: "red.50",
                              borderRadius: "sm",
                            },
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
