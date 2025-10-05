import {
  dataTableBulkActionButtonRecipe,
  dataTableBulkClearButtonRecipe,
  dataTableBulkInfoRecipe,
  dataTableBulkToolbarRecipe,
} from "@/styles/recipes/components/data-table.recipe";

interface BulkActionsToolbarProps {
  selectedCount: number;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}

export default function BulkActionsToolbar({
  selectedCount,
  onDeleteSelected,
  onClearSelection,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className={dataTableBulkToolbarRecipe()}>
      <div className={dataTableBulkInfoRecipe()}>
        <span>{selectedCount}件選択中</span>
        <button
          type="button"
          className={dataTableBulkClearButtonRecipe()}
          onClick={onClearSelection}
        >
          選択を解除
        </button>
      </div>

      <div>
        <button
          type="button"
          className={dataTableBulkActionButtonRecipe()}
          onClick={onDeleteSelected}
        >
          選択した項目を削除
        </button>
      </div>
    </div>
  );
}
