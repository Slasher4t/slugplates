// v2.0: no separate "mobile page-title bar" - each page renders its own
// heading as the first thing in its scrollable content (see MenuPage /
// TodayPage / GoalsPage / HistoryPage), matching the mockups exactly (Menu
// has no heading at all - "food must appear high on the screen" - while
// Today/Goals/History each open with their own serif title). AppShell here
// is purely navigation chrome: the desktop top nav and the mobile bottom tab
// bar, both safe-area aware, both identical in light and dark (only tokens
// change - see the dark-mode-responsive-rule in global.css).

import { NavLink, Outlet } from "react-router-dom";
import { GoalsIcon, HistoryIcon, MenuIcon, TodayIcon } from "../icons";

const TABS = [
  { to: "/menu", label: "Menu", Icon: MenuIcon },
  { to: "/today", label: "Today", Icon: TodayIcon },
  { to: "/goals", label: "Goals", Icon: GoalsIcon },
  { to: "/history", label: "History", Icon: HistoryIcon },
];

export function AppShell() {
  return (
    <div className="app-shell">
      {/* Desktop top nav - plain surface bar, underline active state, no
          navy fill (v1.x's filled navy bar read as "generic SaaS dashboard",
          not the restrained editorial look this release targets). No
          notification/avatar affordance - v2.0 has no accounts (see
          roadmap: that's v2.1), so nothing would be behind either icon. */}
      <header className="top-nav">
        <div className="top-nav-brand">
          <img src="/icon.svg" alt="" className="brand-icon" width={24} height={24} />
          SlugPlates
        </div>
        <nav className="top-nav-links">
          {TABS.map(({ to, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `top-nav-link${isActive ? " active" : ""}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar - fixed, safe-area aware (clears the home
          indicator on notched iPhones and in standalone PWA display). */}
      <nav className="tab-bar" aria-label="Primary">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `tab-item${isActive ? " active" : ""}`}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
