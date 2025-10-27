import { dataTableBodyRecipe } from "@/styles/recipes/components/data-table.recipe";

import TanstackTableRow from "./TanstackTableRow";
import type { TableComponentProps } from "./types";

export default function TanstackTableBody<T>({
  table,
  onRowClick,
  rowSelectionMode = "none",
}: TableComponentProps<T>) {
  return (
    <tbody className={dataTableBodyRecipe()}>
      {table.getRowModel().rows.map((row) => (
        <TanstackTableRow
          key={row.id}
          row={row}
          onClick={onRowClick}
          selectionMode={rowSelectionMode}
        />
      ))}
    </tbody>
  );
}
