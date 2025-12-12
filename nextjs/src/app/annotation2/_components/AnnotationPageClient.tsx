"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { css } from "../../../../styled-system/css";
import { calculateBBox } from "../_utils/geometry";
import { createDefaultConfig, evaluateFilter } from "../_lib/filter-utils";
import type {
  AnnotationRegion,
  FilterConfig,
  FilterGroup,
  MetricStat,
} from "../_types";
import {
  saveAddedAnnotations,
  saveFilterConfig,
  saveRemovedAnnotations,
} from "../actions";
import { CanvasLayer } from "./CanvasLayer";
import { ControlPanel } from "./ControlPanel";

interface AnnotationPageClientProps {
  initialRegions: AnnotationRegion[];
  stats: MetricStat[];
  imageUrl: string;
  initialRemovedIds?: number[]; // 初期ロード時の削除済みID
  initialFilterConfig?: FilterConfig | null; // 初期ロード時のフィルタ設定
  initialAddedRegions?: AnnotationRegion[]; // 初期ロード時の追加領域
}

export function AnnotationPageClient({
  initialRegions,
  stats,
  imageUrl,
  initialRemovedIds = [],
  initialFilterConfig = null,
  initialAddedRegions = [],
}: AnnotationPageClientProps) {
  // ユーザーによって手動で削除された領域のIDを管理
  const [removedIds, setRemovedIds] = useState<Set<number>>(
    new Set(initialRemovedIds),
  );
  // 現在マウスがホバーしている領域のIDを管理
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // 手動で追加された領域の管理
  const [addedRegions, setAddedRegions] = useState<AnnotationRegion[]>(
    initialAddedRegions,
  );

  // モード管理: select (削除/復元) | draw (追記)
  const [editMode, setEditMode] = useState<"select" | "draw">("select");

  // 保存処理の状態管理
  const [isSaving, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // フィルタ設定の状態管理 (v2 -> v3)
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(() => {
    if (initialFilterConfig && initialFilterConfig.version === 3) {
      return initialFilterConfig;
    }
    return createDefaultConfig();
  });

  // 初期設定の同期
  useEffect(() => {
    if (initialFilterConfig && initialFilterConfig.version === 3) {
      console.log("[AnnotationPageClient] Applying initial filter config v3");
      setFilterConfig(initialFilterConfig);
    }
  }, [initialFilterConfig]);

  // 全領域（初期ロード分 + 手動追加分）
  const allRegions = useMemo(() => {
    return [...initialRegions, ...addedRegions];
  }, [initialRegions, addedRegions]);

  // フィルタリングロジック (再帰評価)
  const filteredIds = useMemo(() => {
    const ids = new Set<number>();

    // Rootが無効ならフィルタリングなし
    if (!filterConfig.root.enabled) return ids;

    for (const region of allRegions) {
      // Rootグループから評価開始
      // evaluateFilter: true = Pass (表示), false = Block (除外)
      // したがって、false の場合に filteredIds に追加する
      if (!evaluateFilter(filterConfig.root, region)) {
        ids.add(region.id);
      }
    }
    return ids;
  }, [allRegions, filterConfig]);

  // クリックされた領域のIDをremovedIdsに追加または削除するハンドラ
  const handleRegionClick = (id: number) => {
    // 手動追加された領域は、クリックでの削除（非表示化）対象外とする
    // 削除したい場合は「追記リスト」から削除する
    const target = allRegions.find((r) => r.id === id);
    if (target?.isManualAdded) return;

    setRemovedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id); // 既に削除済みなら元に戻す
      } else {
        next.add(id); // 未削除なら削除リストに追加
      }
      return next;
    });
  };

  // 範囲選択で指定されたIDリストを一括削除（または復元）するハンドラ
  const handleRangeSelect = (ids: number[]) => {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        // 手動追加領域は除外
        const target = allRegions.find((r) => r.id === id);
        if (target?.isManualAdded) return;

        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });
      return next;
    });
  };

  // 領域追加ハンドラ
  const handleAddRegion = (points: { x: number; y: number }[]) => {
    // 負のIDを使用して既存IDとの衝突を避ける
    const id = -1 * Date.now();
    const bbox = calculateBBox(points);

    const newRegion: AnnotationRegion = {
      id,
      bbox,
      points,
      metrics: {}, // メトリクスなし
      isManualAdded: true, // 手動追加フラグ
    };

    setAddedRegions((prev) => [...prev, newRegion]);
  };

  // 追記領域の削除ハンドラ
  const handleRemoveAddedRegion = (id: number) => {
    setAddedRegions((prev) => prev.filter((r) => r.id !== id));
  };

  // フィルタ設定更新ハンドラ
  const handleUpdateRoot = (newRoot: FilterGroup) => {
    setFilterConfig((prev) => ({ ...prev, root: newRoot }));
  };

  // 保存ボタンのハンドラ
  const handleSave = () => {
    setSaveMessage(null);
    startTransition(async () => {
      // 1. 手動削除IDの保存 (remove.json)
      const removeResult = await saveRemovedAnnotations(Array.from(removedIds));

      // 2. フィルタ設定と除外IDの保存 (filtered.json)
      const configToSave: FilterConfig = {
        ...filterConfig,
        excludedIds: Array.from(filteredIds),
      };
      const filterResult = await saveFilterConfig(configToSave);

      // 3. 手動追加領域の保存 (additions.json)
      const addResult = await saveAddedAnnotations(addedRegions);

      if (removeResult.success && filterResult.success && addResult.success) {
        setSaveMessage({
          type: "success",
          text: "保存しました (remove, filtered, additions)",
        });
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const errorMsgs = [];
        if (!removeResult.success) errorMsgs.push(removeResult.message);
        if (!filterResult.success) errorMsgs.push(filterResult.message);
        if (!addResult.success) errorMsgs.push(addResult.message);
        setSaveMessage({
          type: "error",
          text: `保存失敗: ${errorMsgs.join(", ")}`,
        });
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
        <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>
          Annotation Tool V2 (Recursive Filter)
        </h1>
      </div>

      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "1fr 400px", // パネルを少し広くする
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
            regions={allRegions} // 全領域を渡す
            filteredIds={filteredIds}
            removedIds={removedIds}
            hoveredId={hoveredId}
            editMode={editMode}
            onHover={setHoveredId}
            onClick={handleRegionClick}
            onRangeSelect={handleRangeSelect}
            onAddRegion={handleAddRegion} // 追加
          />
          <div
            className={css({
              marginTop: "4",
              fontSize: "sm",
              color: "gray.600",
            })}
          >
            Total Regions: {allRegions.length} (Added: {addedRegions.length}) |
            Filtered: {filteredIds.size} | Removed: {removedIds.size}
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
          {/* 保存エリア */}
          <div
            className={css({
              padding: "4",
              backgroundColor: "white",
              borderRadius: "xl",
              border: "1px solid token(colors.gray.200)",
              boxShadow: "sm",
            })}
          >
            {/* モード切替 */}
            <div
              className={css({ display: "flex", gap: "2", marginBottom: "4" })}
            >
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
                  color: editMode === "select" ? "white" : "gray.700",
                  "&:hover": {
                    opacity: 0.9,
                  },
                })}
              >
                選択 / 削除
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
                  color: editMode === "draw" ? "white" : "gray.700",
                  "&:hover": {
                    opacity: 0.9,
                  },
                })}
              >
                追記 (Draw)
              </button>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={css({
                width: "100%",
                padding: "3",
                backgroundColor: isSaving ? "gray.400" : "blue.600",
                color: "white",
                borderRadius: "md",
                fontWeight: "semibold",
                cursor: isSaving ? "not-allowed" : "pointer",
                transition: "background-color 0.2s",
                "&:hover": {
                  backgroundColor: isSaving ? "gray.400" : "blue.700",
                },
              })}
            >
              {isSaving
                ? "保存中..."
                : "変更を保存 (remove, filtered, additions)"}
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

          {/* 追記リスト (Drawモード時のみ表示) */}
          {editMode === "draw" && (
            <div
              className={css({
                padding: "4",
                backgroundColor: "white",
                color: "gray.900", // 文字色を明示
                borderRadius: "xl",
                border: "1px solid token(colors.gray.200)",
                boxShadow: "sm",
              })}
            >
              <h3
                className={css({
                  fontWeight: "bold",
                  marginBottom: "2",
                  color: "gray.900",
                })}
              >
                Added Regions
              </h3>
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
                        alignItems: "center",
                        padding: "2",
                        borderBottom: "1px solid #eee",
                        fontSize: "xs",
                        color: "gray.800", // アイテム文字色
                        borderRadius: "md",
                        transition: "background-color 0.2s",
                        "&:hover": { backgroundColor: "gray.100" },
                      })}
                      onMouseEnter={() => setHoveredId(region.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <span>
                        #{index + 1} (ID: {region.id})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAddedRegion(region.id)}
                        className={css({
                          color: "red.600",
                          fontWeight: "semibold",
                          cursor: "pointer",
                          padding: "2px 6px",
                          borderRadius: "sm",
                          "&:hover": {
                            backgroundColor: "red.50",
                            textDecoration: "none",
                          },
                        })}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <ControlPanel
            stats={stats}
            rootGroup={filterConfig.root}
            maxDepth={filterConfig.maxDepth}
            onUpdateRoot={handleUpdateRoot}
          />
        </div>
      </div>
    </div>
  );
}