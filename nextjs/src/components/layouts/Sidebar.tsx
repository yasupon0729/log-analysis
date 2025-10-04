"use client";

import { useState } from "react";
import { css } from "@/styled-system/css";
import {
  sidebarHeaderRecipe,
  sidebarIconRecipe,
  sidebarLabelRecipe,
  sidebarNavItemRecipe,
  sidebarNavRecipe,
  sidebarRecipe,
  sidebarToggleRecipe,
} from "@/styles/recipes/layouts/sidebar.recipe";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", active: true },
  { id: "logs", label: "Logs", icon: "📝" },
  { id: "analytics", label: "Analytics", icon: "📈" },
  { id: "filters", label: "Filters", icon: "🔍" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [activeItem, setActiveItem] = useState("dashboard");

  return (
    <aside className={sidebarRecipe({ expanded })}>
      {/* Header */}
      <div className={sidebarHeaderRecipe()}>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: 3,
          })}
        >
          <span
            className={css({
              fontSize: "2xl",
              color: "primary.400",
            })}
          >
            🚀
          </span>
          {expanded && (
            <span
              className={css({
                fontSize: "lg",
                fontWeight: "bold",
                color: "text.primary",
              })}
              style={{
                background: "linear-gradient(135deg, #47a3f3 0%, #34d399 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Log Analysis
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className={sidebarNavRecipe()}>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={sidebarNavItemRecipe({
              active: activeItem === item.id,
              expanded,
            })}
            onClick={() => setActiveItem(item.id)}
          >
            <span className={sidebarIconRecipe()}>{item.icon}</span>
            <span className={sidebarLabelRecipe({ expanded })}>
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      {/* Footer - User Info */}
      <div
        className={css({
          borderTop: "thin",
          borderColor: "dark.border",
          p: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 3,
        })}
      >
        <div
          className={css({
            width: "32px",
            height: "32px",
            borderRadius: "full",
            bg: "tertiary.600",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: "sm",
            fontWeight: "bold",
          })}
        >
          U
        </div>
        {expanded && (
          <div className={css({ flex: 1 })}>
            <div
              className={css({
                fontSize: "sm",
                color: "text.primary",
                fontWeight: "medium",
              })}
            >
              User
            </div>
            <div
              className={css({
                fontSize: "xs",
                color: "text.tertiary",
              })}
            >
              Admin
            </div>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <button
        type="button"
        className={sidebarToggleRecipe()}
        onClick={() => setExpanded(!expanded)}
        aria-label="Toggle sidebar"
      >
        <span
          className={css({
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease-in-out",
          })}
        >
          ▶
        </span>
      </button>
    </aside>
  );
}
