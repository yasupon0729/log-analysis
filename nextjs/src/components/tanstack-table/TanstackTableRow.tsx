import type { Row } from "@tanstack/react-table";

import { dataTableRowRecipe } from "@/styles/recipes/components/data-table.recipe";

import TanstackTableCell from "./TanstackTableCell";

interface TanstackTableRowProps<T> {
  row: Row<T>;
}

export default function TanstackTableRow<T>({ row }: TanstackTableRowProps<T>) {
  return (
    <tr className={dataTableRowRecipe({ selected: row.getIsSelected() })}>
      {row.getVisibleCells().map((cell) => (
        <TanstackTableCell key={cell.id} cell={cell} />
      ))}
    </tr>
  );
}
