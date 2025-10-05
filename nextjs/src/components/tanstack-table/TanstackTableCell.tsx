import { type Cell, flexRender } from "@tanstack/react-table";

import { dataTableCellRecipe } from "@/styles/recipes/components/data-table.recipe";

import type { CustomColumnMeta } from "./types";

interface TanstackTableCellProps<T> {
  cell: Cell<T, unknown>;
}

export default function TanstackTableCell<T>({
  cell,
}: TanstackTableCellProps<T>) {
  const meta = cell.column.columnDef.meta as CustomColumnMeta | undefined;
  const cellType = meta?.cellType ?? "text";
  const editable = meta?.editable ?? false;
  const width = cell.column.getSize();

  return (
    <td
      className={dataTableCellRecipe({ cellType, editable })}
      style={{
        width: `${width}px`,
        minWidth: `${cell.column.columnDef.minSize ?? 40}px`,
      }}
    >
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </td>
  );
}
