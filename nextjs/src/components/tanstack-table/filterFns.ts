import type { FilterFn } from "@tanstack/react-table";

import type { DateRangeFilterValue } from "./types";

function parseIsoTimestamp(value: unknown): number | null {
  return parseFlexibleDate(value);
}

function parseFlexibleDate(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const direct = Date.parse(trimmed);
  if (!Number.isNaN(direct)) {
    return direct;
  }

  const match = trimmed.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,6}))?)?)?)?$/,
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "0", minute = "0", second = "0", fraction] =
    match;

  let milliseconds = 0;
  if (fraction) {
    const fractionPadded = `${fraction}000`.slice(0, 3);
    milliseconds = Number(fractionPadded);
  }

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  );

  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function createDateRangeFilter<T>(): FilterFn<T> {
  const filterFn: FilterFn<T> = (row, columnId, filterValue) => {
    if (!filterValue || typeof filterValue !== "object") {
      return true;
    }

    const { start, end } = filterValue as DateRangeFilterValue;
    const rawValue = row.getValue(columnId);
    const timestamp = parseIsoTimestamp(rawValue);

    if (timestamp === null) {
      return false;
    }

    if (start) {
      const startTime = parseIsoTimestamp(start);
      if (startTime !== null && timestamp < startTime) {
        return false;
      }
    }

    if (end) {
      const endTime = parseIsoTimestamp(end);
      if (endTime !== null && timestamp > endTime) {
        return false;
      }
    }

    return true;
  };

  return filterFn;
}

const LOGICAL_OR_TOKEN = "||";
const LOGICAL_AND_TOKEN = "&&";

function normaliseLogicalOperators(value: string): string {
  return value
    .replace(/\s+(AND)\s+/gi, ` ${LOGICAL_AND_TOKEN} `)
    .replace(/\s+(OR)\s+/gi, ` ${LOGICAL_OR_TOKEN} `)
    .replace(/\s*\|\|\s*/g, LOGICAL_OR_TOKEN)
    .replace(/\s*&&\s*/g, LOGICAL_AND_TOKEN);
}

function splitByToken(value: string, token: string): string[] {
  if (!token) {
    return [value];
  }
  const parts: string[] = [];
  let buffer = "";
  let index = 0;

  while (index < value.length) {
    if (value.slice(index, index + token.length) === token) {
      parts.push(buffer);
      buffer = "";
      index += token.length;
      continue;
    }
    buffer += value[index];
    index += 1;
  }

  parts.push(buffer);
  return parts;
}

function parseAdvancedTextQuery(value: string): string[][] {
  const canonical = normaliseLogicalOperators(value);
  const orSegments = splitByToken(canonical, LOGICAL_OR_TOKEN);
  const groups: string[][] = [];

  for (const segment of orSegments) {
    const tokens = splitByToken(segment, LOGICAL_AND_TOKEN)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    if (tokens.length > 0) {
      groups.push(tokens);
    }
  }

  if (groups.length === 0) {
    const fallback = canonical.trim();
    if (fallback.length > 0) {
      groups.push([fallback]);
    }
  }

  return groups;
}

function buildRegexFromToken(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
    const lastSlashIndex = trimmed.lastIndexOf("/");
    const body = trimmed.slice(1, lastSlashIndex);
    const flags = trimmed.slice(lastSlashIndex + 1) || "i";
    try {
      return new RegExp(body, flags);
    } catch {
      return null;
    }
  }

  try {
    return new RegExp(trimmed, "i");
  } catch {
    return null;
  }
}

function matchesToken(
  value: string,
  valueLower: string,
  token: string,
): boolean {
  if (!token) {
    return true;
  }
  const regex = buildRegexFromToken(token);
  if (regex) {
    try {
      return regex.test(value);
    } catch {
      // 無効な正規表現は部分一致にフォールバック
    }
  }
  return valueLower.includes(token.toLowerCase());
}

function matchAdvancedText(value: string, query: string): boolean {
  const trimmedQuery = query.trim();
  if (trimmedQuery === "") {
    return true;
  }

  const normalizedValue = value ?? "";
  const lowerValue = normalizedValue.toLowerCase();
  const groups = parseAdvancedTextQuery(trimmedQuery);

  return groups.some((group) =>
    group.every((token) => matchesToken(normalizedValue, lowerValue, token)),
  );
}

export function createAdvancedTextFilter<T>(): FilterFn<T> {
  const filterFn: FilterFn<T> = (row, columnId, filterValue) => {
    const query =
      typeof filterValue === "string"
        ? filterValue
        : filterValue !== null && filterValue !== undefined
          ? String(filterValue)
          : "";

    if (query.trim() === "") {
      return true;
    }

    const rawValue = row.getValue<unknown>(columnId);
    const candidate =
      rawValue === null || rawValue === undefined ? "" : String(rawValue);

    return matchAdvancedText(candidate, query);
  };

  return filterFn;
}

export const dateRangeFilter = createDateRangeFilter<unknown>();
export const advancedTextFilter = createAdvancedTextFilter<unknown>();
