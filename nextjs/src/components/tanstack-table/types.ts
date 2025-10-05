import type { ColumnDef, Table as TanstackTable } from "@tanstack/react-table";

export type CellType = "text" | "name" | "status" | "date" | "any" | "actions";
export type FilterVariant = "text" | "select";

export interface FilterOption {
  label: string;
  value: string;
}

export interface CustomColumnMeta {
  cellType?: CellType;
  filterVariant?: FilterVariant;
  filterOptions?: FilterOption[];
  filterPlaceholder?: string;
  enableGlobalFilter?: boolean;
  editable?: boolean;
}

export interface TableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  isLoading?: boolean;
  error?: string | null;
  enableRowSelection?: boolean;
  getRowId?: (originalRow: T, index: number) => string;
}

export interface TableComponentProps<T> {
  table: TanstackTable<T>;
}
