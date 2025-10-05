import { useEffect, useId, useState } from "react";

import { css } from "@/styled-system/css";
import {
  dataTableGlobalFilterContainerRecipe,
  dataTableGlobalFilterInputRecipe,
  dataTableGlobalFilterLabelRecipe,
} from "@/styles/recipes/components/data-table.recipe";

interface GlobalFilterProps {
  value: string;
  onChange: (value: string) => void;
  resultsCount?: number;
  totalCount?: number;
  placeholder?: string;
}

const resultsInfoClass = css({
  fontSize: "sm",
  color: "text.secondary",
});

export default function GlobalFilter({
  value,
  onChange,
  resultsCount,
  totalCount,
  placeholder = "キーワードを入力",
}: GlobalFilterProps) {
  const [inputValue, setInputValue] = useState(value);
  const inputId = useId();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onChange(inputValue);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [inputValue, onChange]);

  return (
    <div className={dataTableGlobalFilterContainerRecipe()}>
      <label htmlFor={inputId} className={dataTableGlobalFilterLabelRecipe()}>
        全体検索
      </label>
      <input
        id={inputId}
        type="text"
        className={dataTableGlobalFilterInputRecipe()}
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
      />
      {resultsCount !== undefined && totalCount !== undefined ? (
        <span className={resultsInfoClass}>
          {resultsCount} / {totalCount} 件
        </span>
      ) : null}
    </div>
  );
}
