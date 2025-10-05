import type { Table } from "@tanstack/react-table";
import type { ReactNode } from "react";

import {
  dataTablePaginationButtonRecipe,
  dataTablePaginationContainerRecipe,
  dataTablePaginationInfoRecipe,
  dataTablePaginationNavRecipe,
  dataTablePaginationSelectRecipe,
} from "@/styles/recipes/components/data-table.recipe";

interface PaginationProps<T> {
  table: Table<T>;
}

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000];

export default function Pagination<T>({ table }: PaginationProps<T>) {
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const startRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows);

  return (
    <div className={dataTablePaginationContainerRecipe()}>
      <div className={dataTablePaginationInfoRecipe()}>
        <span>
          表示件数: {startRow === 0 ? 0 : startRow} - {endRow} / {totalRows} 件
        </span>
        <select
          className={dataTablePaginationSelectRecipe()}
          value={pageSize}
          onChange={(event) => table.setPageSize(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}件/ページ
            </option>
          ))}
        </select>
      </div>

      <div className={dataTablePaginationNavRecipe()}>
        <button
          type="button"
          className={dataTablePaginationButtonRecipe({ variant: "nav" })}
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          aria-label="最初のページへ"
        >
          {"<<"}
        </button>
        <button
          type="button"
          className={dataTablePaginationButtonRecipe({ variant: "nav" })}
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          aria-label="前のページへ"
        >
          {"<"}
        </button>

        {renderPageButtons({ table, pageCount, pageIndex })}

        <button
          type="button"
          className={dataTablePaginationButtonRecipe({ variant: "nav" })}
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          aria-label="次のページへ"
        >
          {">"}
        </button>
        <button
          type="button"
          className={dataTablePaginationButtonRecipe({ variant: "nav" })}
          onClick={() => table.setPageIndex(pageCount - 1)}
          disabled={!table.getCanNextPage()}
          aria-label="最後のページへ"
        >
          {">>"}
        </button>
      </div>
    </div>
  );
}

function renderPageButtons<T>({
  table,
  pageCount,
  pageIndex,
}: {
  table: Table<T>;
  pageCount: number;
  pageIndex: number;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const buttons: ReactNode[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const isEdgePage = index === 0 || index === pageCount - 1;
    const isNearbyPage = Math.abs(index - pageIndex) <= 2;

    if (isEdgePage || isNearbyPage) {
      buttons.push(
        <button
          key={index}
          type="button"
          className={dataTablePaginationButtonRecipe({
            variant: "number",
            active: index === pageIndex,
          })}
          onClick={() => table.setPageIndex(index)}
          aria-label={`ページ${index + 1}へ`}
          aria-current={index === pageIndex ? "page" : undefined}
        >
          {index + 1}
        </button>,
      );
      continue;
    }

    const shouldRenderLeadingEllipsis = index === pageIndex - 3;
    const shouldRenderTrailingEllipsis = index === pageIndex + 3;

    if (shouldRenderLeadingEllipsis || shouldRenderTrailingEllipsis) {
      buttons.push(
        <span
          key={`ellipsis-${index}`}
          className={dataTablePaginationButtonRecipe({ variant: "ellipsis" })}
        >
          …
        </span>,
      );
    }
  }

  return buttons;
}
