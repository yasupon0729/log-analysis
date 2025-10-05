import { flexRender } from "@tanstack/react-table";

import { css } from "@/styled-system/css";
import {
  dataTableFilterCellRecipe,
  dataTableFilterRowRecipe,
  dataTableHeaderCellRecipe,
  dataTableHeadRecipe,
  dataTableSortIconRecipe,
} from "@/styles/recipes/components/data-table.recipe";

import ColumnFilter from "./ColumnFilter";
import type { TableComponentProps } from "./types";

const headerContentClass = css({
  display: "flex",
  alignItems: "center",
  gap: 2,
});

export default function TanstackTableHeader<T>({
  table,
}: TableComponentProps<T>) {
  const headerGroups = table.getHeaderGroups();
  const leafHeaders = headerGroups[headerGroups.length - 1]?.headers ?? [];

  return (
    <thead className={dataTableHeadRecipe()}>
      {headerGroups.map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => {
            const canSort = header.column.getCanSort();
            const sortState = header.column.getIsSorted();
            const direction =
              sortState === "asc"
                ? "asc"
                : sortState === "desc"
                  ? "desc"
                  : "none";
            const toggleSorting = header.column.getToggleSortingHandler();
            const handleKeyDown = (
              event: React.KeyboardEvent<HTMLTableCellElement>,
            ) => {
              if (!canSort) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleSorting?.(event);
              }
            };

            return (
              <th
                key={header.id}
                className={dataTableHeaderCellRecipe({
                  sortable: canSort,
                  direction,
                })}
                onClick={canSort ? toggleSorting : undefined}
                onKeyDown={canSort ? handleKeyDown : undefined}
                role={canSort ? "button" : undefined}
                tabIndex={canSort ? 0 : undefined}
                aria-sort={
                  sortState === "asc"
                    ? "ascending"
                    : sortState === "desc"
                      ? "descending"
                      : "none"
                }
              >
                <div className={headerContentClass}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                  {canSort ? (
                    <span
                      className={dataTableSortIconRecipe({
                        active: sortState !== false,
                      })}
                      aria-hidden="true"
                    >
                      {sortState === "asc"
                        ? "↑"
                        : sortState === "desc"
                          ? "↓"
                          : "↕"}
                    </span>
                  ) : null}
                </div>
              </th>
            );
          })}
        </tr>
      ))}

      <tr className={dataTableFilterRowRecipe()}>
        {leafHeaders.map((header) => (
          <th
            key={`${header.id}-filter`}
            className={dataTableFilterCellRecipe()}
          >
            {header.column.getCanFilter() ? (
              <ColumnFilter column={header.column} />
            ) : null}
          </th>
        ))}
      </tr>
    </thead>
  );
}
