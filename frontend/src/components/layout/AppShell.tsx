import { NavLink, Outlet, useLocation } from "react-router-dom";
import { GoalsIcon, HistoryIcon, MenuIcon, TodayIcon } from "../icons";

const TABS = [
  { to: "/menu", label: "Menu", Icon: MenuIcon },
  { to: "/today", label: "Today", Icon: TodayIcon },
  { to: "/goals", label: "Goals", Icon: GoalsIcon },
  { to: "/history", label: "History", Icon: HistoryIcon },
];

const PAGE_TITLES: Record<string, string> = {
  "/menu": "Menu",
  "/today": "Today",
  "/goals": "Goals",
  "/history": "History",
};

export function AppShell() {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? "SlugEats";

  return (
    <div className="app-shell">
      {/* Desktop top nav */}
      <header className="top-nav">
        <div className="top-nav-brand">
          <img src="/icon.svg" alt="" className="brand-icon" width={26} height={26} />
          SlugEats
        </div>
        <nav className="top-nav-links">
          {TABS.map(({ to, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `top-nav-link${isActive ? " active" : ""}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Mobile title header */}
      <header className="mobile-header">
        <img src="/icon.svg" alt="" className="brand-icon" width={22} height={22} />
        <h1>{title}</h1>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="tab-bar">
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
