"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  href?: string;
}

const navItems: NavItem[] = [
  {
    id: "security-groups",
    label: "セキュリティグループ",
    icon: "🛡️",
    href: "/ec2/security-groups",
  },
  { id: "logs", label: "ログ", icon: "📝", href: "/upload" },
  { id: "results", label: "結果", icon: "🔍", href: "/results" },

  // 未実装タブは保守のため残しておくが、ナビゲーションには表示しない
  // { id: "dashboard", label: "Dashboard", icon: "📊", href: "/" },
  // { id: "analytics", label: "Analytics", icon: "📈" },
  // { id: "filters", label: "Filters", icon: "🔍" },
  // { id: "settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [activeItem, setActiveItem] = useState(() => navItems[0]?.id ?? "");

  useEffect(() => {
    const width = expanded ? "240px" : "80px";
    document.documentElement.style.setProperty("--sidebar-width", width);
    return () => {
      document.documentElement.style.setProperty("--sidebar-width", "80px");
    };
  }, [expanded]);

  useEffect(() => {
    if (!pathname) {
      return;
    }
    const matched = navItems.find(
      (item) => item.href && pathname.startsWith(item.href),
    );
    if (matched) {
      setActiveItem(matched.id);
    }
  }, [pathname]);

  return (
    <aside className={sidebarRecipe({ expanded })}>
      {/* Header */}
      <div className={sidebarHeaderRecipe()}>
        <button
          type="button"
          className={sidebarLogoContainerRecipe()}
          onClick={() => router.push("/")}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            width: "100%",
          }}
          aria-label="トップへ戻る"
        >
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
        </button>
      </div>

      {/* Navigation */}
      <nav className={sidebarNavRecipe()}>
        {navItems.map((item) => {
          const isActive =
            item.href && pathname
              ? pathname === item.href || pathname.startsWith(`${item.href}/`)
              : activeItem === item.id;

          return (
            <Button
              key={item.id}
              type="button"
              className={sidebarNavItemRecipe({
                active: isActive,
                expanded,
              })}
              variant="unstyled"
              onClick={() => {
                setActiveItem(item.id);
                if (item.href) {
                  router.push(item.href);
                }
              }}
            >
              <span className={sidebarIconRecipe()}>{item.icon}</span>
              <span className={sidebarLabelRecipe({ expanded })}>
                {item.label}
              </span>
            </Button>
          );
        })}
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
