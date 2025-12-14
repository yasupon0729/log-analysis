import type { AnnotationRegion, FilterConfig, FilterNode } from "../_types";

// 評価ロジック
// 戻り値: true = Pass (表示する), false = Block (除外する)
export function evaluateFilter(
  node: FilterNode,
  region: AnnotationRegion,
  ignoreManualFlag = false,
  forPipeline = false, // 新しい引数: パイプライン実行時にactionによる反転をスキップ
): boolean {
  // 手動追加された領域は常にフィルタを通過させる（表示する）
  // ただし、パイプライン実行時などはフラグで無効化する
  if (!ignoreManualFlag && region.isManualAdded) return true;

  if (!node.enabled) return true; // 無効なノードは判定に影響させない（Pass扱い）

  // Condition: 常に「範囲内かどうか」を判定
  if (node.type === "condition") {
    const val = region.metrics[node.metric];
    if (val === undefined) return false; // データなしはマッチしない
    return val >= node.min && val <= node.max;
  }

  if (node.type === "group") {
    const activeChildren = node.children.filter((c) => c.enabled);
    if (activeChildren.length === 0) return true; // 空グループはPass

    // 子要素の評価
    const results = activeChildren.map((c) =>
      evaluateFilter(c, region, ignoreManualFlag, forPipeline), // forPipeline を再帰的に渡す
    );

    // 結合 (Logic)
    let isMatch = false;
    if (node.logic === "AND") {
      isMatch = results.every((r) => r);
    } else {
      // OR
      isMatch = results.some((r) => r);
    }

    // Action適用
    if (forPipeline) {
      // パイプライン用途の場合、actionによる最終的な反転は行わない。
      // 純粋に条件にマッチしたかどうかを返す。
      return isMatch;
    } else if (node.action === "remove") {
      // Removeモード: 条件に合致(True)したら、除外(False/Block)する
      // 条件に合致しない(False)なら、通過(True/Pass)する
      return !isMatch;
    }
    // Keepモード: 条件に合致(True)したら、通過(True/Pass)する
    // 合致しない(False)なら、除外(False/Block)する
    return isMatch;
  }

  return true;
}

// デフォルト設定 (v3)
export function createDefaultConfig(): FilterConfig {
  return {
    version: 3,
    root: {
      id: "root",
      type: "group",
      action: "keep", // ルートは通常 Keep (条件に合うものを残す)
      logic: "AND", // 子グループの絞り込み (A and B)
      children: [],
      enabled: true,
    },
    maxDepth: 2,
    excludedIds: [],
  };
}

// 論理式の可視化
export function getFilterExpression(node: FilterNode): string {
  if (!node.enabled) return "";

  if (node.type === "condition") {
    const formatNum = (n: number) => Number(n.toFixed(2));
    // Conditionは常に [min-max]
    // ユーザー要望により等号を明示
    return `${node.metric}[${formatNum(node.min)} <= x <= ${formatNum(
      node.max,
    )}]`;
  }

  if (node.type === "group") {
    const childrenExprs = node.children
      .map((child) => getFilterExpression(child))
      .filter((expr) => expr !== "");

    if (childrenExprs.length === 0) return "";

    const separator = node.logic === "OR" ? " ∪ " : " ∩ ";
    const combined = childrenExprs.join(separator);
    const wrapped = childrenExprs.length > 1 ? `(${combined})` : combined;

    // Actionを表示
    if (node.action === "remove") {
      return `REMOVE ${wrapped}`;
    }
    return `KEEP ${wrapped}`;
  }

  return "";
}
