"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  sidebarFooterRecipe,
  sidebarHeaderRecipe,
  sidebarIconRecipe,
  sidebarLabelRecipe,
  sidebarLogoContainerRecipe,
  sidebarLogoIconRecipe,
  sidebarLogoTextRecipe,
  sidebarNavItemRecipe,
  sidebarNavRecipe,
  sidebarRecipe,
  sidebarToggleIconRecipe,
  sidebarToggleRecipe,
  sidebarUserAvatarRecipe,
  sidebarUserInfoRecipe,
  sidebarUserNameRecipe,
  sidebarUserRoleRecipe,
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
        <div className={sidebarLogoContainerRecipe()}>
          <span className={sidebarLogoIconRecipe()}>🚀</span>
          {expanded && (
            <span
              className={sidebarLogoTextRecipe()}
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
          <Button
            key={item.id}
            type="button"
            className={sidebarNavItemRecipe({
              active: activeItem === item.id,
              expanded,
            })}
            variant="unstyled"
            onClick={() => setActiveItem(item.id)}
          >
            <span className={sidebarIconRecipe()}>{item.icon}</span>
            <span className={sidebarLabelRecipe({ expanded })}>
              {item.label}
            </span>
          </Button>
        ))}
      </nav>

      {/* Footer - User Info */}
      <div className={sidebarFooterRecipe()}>
        <div className={sidebarUserAvatarRecipe()}>U</div>
        {expanded && (
          <div className={sidebarUserInfoRecipe()}>
            <div className={sidebarUserNameRecipe()}>User</div>
            <div className={sidebarUserRoleRecipe()}>Admin</div>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <Button
        type="button"
        className={sidebarToggleRecipe()}
        onClick={() => setExpanded(!expanded)}
        aria-label="Toggle sidebar"
        variant="unstyled"
      >
        <span className={sidebarToggleIconRecipe({ expanded })}>▶</span>
      </Button>
    </aside>
  );
}
