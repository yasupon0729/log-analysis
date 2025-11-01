"use client";

import type { ReactNode } from "react";

import { cx } from "@/styled-system/css";
import {
  cardListActionsRecipe,
  cardListBodyRecipe,
  cardListContainerRecipe,
  cardListHeaderRecipe,
  cardListItemRecipe,
} from "@/styles/recipes/components/card-list.recipe";

interface CardListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderTitle: (item: T) => ReactNode;
  renderMeta?: (item: T) => ReactNode;
  renderFooter?: (item: T) => ReactNode;
  headerTitle?: ReactNode;
  headerActions?: ReactNode;
  emptyState?: ReactNode;
  selectedKey?: string;
  onSelect?: (item: T) => void;
  className?: string;
}

export function CardList<T>({
  items,
  getKey,
  renderTitle,
  renderMeta,
  renderFooter,
  headerTitle,
  headerActions,
  emptyState,
  selectedKey,
  onSelect,
  className,
}: CardListProps<T>) {
  return (
    <div className={cx(cardListContainerRecipe(), className)}>
      {headerTitle || headerActions ? (
        <div className={cardListHeaderRecipe()}>
          <div>{headerTitle}</div>
          <div className={cardListActionsRecipe()}>{headerActions}</div>
        </div>
      ) : null}
      <div className={cardListBodyRecipe()}>
        {items.length === 0
          ? (emptyState ?? null)
          : items.map((item) => {
              const key = getKey(item);
              return (
                <button
                  key={key}
                  type="button"
                  className={cardListItemRecipe({
                    selected: selectedKey === key,
                  })}
                  onClick={() => onSelect?.(item)}
                >
                  <div>{renderTitle(item)}</div>
                  {renderMeta ? <div>{renderMeta(item)}</div> : null}
                  {renderFooter ? <div>{renderFooter(item)}</div> : null}
                </button>
              );
            })}
      </div>
    </div>
  );
}
