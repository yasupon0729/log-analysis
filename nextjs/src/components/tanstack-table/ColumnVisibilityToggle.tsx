import type { Table } from "@tanstack/react-table";

import {
  dataTableColumnVisibilityCheckboxRecipe,
  dataTableColumnVisibilityContainerRecipe,
  dataTableColumnVisibilityItemRecipe,
  dataTableColumnVisibilityLabelRecipe,
  dataTableColumnVisibilityListRecipe,
} from "@/styles/recipes/components/data-table.recipe";

interface ColumnVisibilityToggleProps<T> {
  table: Table<T>;
}

export default function ColumnVisibilityToggle<T>({
  table,
}: ColumnVisibilityToggleProps<T>) {
  const columns = table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide());

  if (columns.length === 0) {
    return null;
  }

  return (
    <div className={dataTableColumnVisibilityContainerRecipe()}>
      <span className={dataTableColumnVisibilityLabelRecipe()}>表示列</span>
      <div className={dataTableColumnVisibilityListRecipe()}>
        {columns.map((column) => {
          const header = column.columnDef.header;
          const label =
            typeof header === "string" && header.trim().length > 0
              ? header
              : column.id;

          return (
            <label
              key={column.id}
              className={dataTableColumnVisibilityItemRecipe()}
            >
              <input
                type="checkbox"
                className={dataTableColumnVisibilityCheckboxRecipe()}
                checked={column.getIsVisible()}
                onChange={(event) => {
                  column.toggleVisibility(event.target.checked);
                }}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
