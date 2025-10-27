import type { Row } from "@tanstack/react-table";

import { dataTableRowRecipe } from "@/styles/recipes/components/data-table.recipe";

import TanstackTableCell from "./TanstackTableCell";

interface TanstackTableRowProps<T> {
  row: Row<T>;
  onClick?: (row: Row<T>) => void;
  selectionMode?: "single" | "multiple" | "none";
}

export default function TanstackTableRow<T>({
  row,
  onClick,
  selectionMode = "none",
}: TanstackTableRowProps<T>) {
  const isSelectable = selectionMode !== "none";

  const handleClick = () => {
    if (!onClick) {
      return;
    }

    onClick(row);
  };

  return (
    <tr
      className={dataTableRowRecipe({ selected: row.getIsSelected() })}
      onClick={onClick ? handleClick : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-selected={isSelectable ? row.getIsSelected() : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleClick();
              }
            }
          : undefined
      }
    >
      {row.getVisibleCells().map((cell) => (
        <TanstackTableCell key={cell.id} cell={cell} />
      ))}
    </tr>
  );
}
