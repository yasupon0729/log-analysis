import { flexRender } from "@tanstack/react-table";
import type { KeyboardEvent } from "react";

import { css } from "@/styled-system/css";
import {
  dataTableColumnResizerRecipe,
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
              event: KeyboardEvent<HTMLTableCellElement>,
            ) => {
              if (!canSort) {
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleSorting?.(event);
              }
            };

            const width = header.getSize();
            const minWidth = header.column.columnDef.minSize ?? 40;
            const maxWidth = header.column.columnDef.maxSize;

            const handleResizeKeyDown = (
              event: KeyboardEvent<HTMLButtonElement>,
            ) => {
              if (!header.column.getCanResize()) {
                return;
              }

              const currentSize = header.getSize();
              const clampSize = (size: number) =>
                typeof maxWidth === "number"
                  ? Math.min(Math.max(size, minWidth), maxWidth)
                  : Math.max(size, minWidth);

              if (event.key === "ArrowLeft") {
                event.preventDefault();
                const nextSize = clampSize(currentSize - 10);
                table.setColumnSizing((prev) => ({
                  ...prev,
                  [header.column.id]: nextSize,
                }));
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                const nextSize = clampSize(currentSize + 10);
                table.setColumnSizing((prev) => ({
                  ...prev,
                  [header.column.id]: nextSize,
                }));
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
                style={{
                  width: `${width}px`,
                  minWidth: `${minWidth}px`,
                  maxWidth:
                    typeof maxWidth === "number" ? `${maxWidth}px` : undefined,
                }}
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
                {header.column.getCanResize() ? (
                  <button
                    className={dataTableColumnResizerRecipe({
                      active: header.column.getIsResizing(),
                    })}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      header.getResizeHandler()(event);
                    }}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      header.getResizeHandler()(event);
                    }}
                    onTouchStart={(event) => {
                      event.stopPropagation();
                      header.getResizeHandler()(event);
                    }}
                    onKeyDown={handleResizeKeyDown}
                    type="button"
                    aria-label="列幅を調整"
                  />
                ) : null}
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
            style={{ width: `${header.getSize()}px` }}
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
