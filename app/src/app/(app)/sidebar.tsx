"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CoinsIcon, LogOutIcon, MenuIcon, XIcon } from "lucide-react";
import { Brand } from "./brand";
import { NAV_GROUPS, isNavItemActive } from "./nav-config";

const DRAWER_ID = "app-sidebar-drawer";

type SidebarProps = {
  /** Show the navigation groups + credits widget. False during onboarding. */
  showNav: boolean;
  /** Placeholder balance until the credits backend lands (DEC-6, F1). */
  credits: number;
  signOutAction: () => Promise<void>;
};

/**
 * Global permanent left sidebar (DEC-3). Two labelled groups plus a pinned
 * credits widget and logout. Collapses into a hamburger drawer on mobile.
 */
export function Sidebar({ showNav, credits, signOutAction }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer after any navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes the drawer while it is open.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Mobile-only top bar: brand + hamburger. Hidden at desktop widths. */}
      <div className="app-topbar">
        <Link href="/" className="app-topbar-brand" aria-label="Vai alla home">
          <Brand />
        </Link>
        {showNav && (
          <button
            type="button"
            className="app-drawer-toggle"
            aria-label={open ? "Chiudi il menu" : "Apri il menu"}
            aria-expanded={open}
            aria-controls={DRAWER_ID}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <XIcon aria-hidden /> : <MenuIcon aria-hidden />}
          </button>
        )}
      </div>

      {/* Backdrop behind the mobile drawer. */}
      <div
        className="app-drawer-backdrop"
        data-open={open}
        hidden={!open}
        onClick={() => setOpen(false)}
      />

      <aside id={DRAWER_ID} className="app-sidebar" data-open={open}>
        <div className="app-sidebar-head">
          <Link href="/" className="app-sidebar-brand" aria-label="Vai alla home">
            <Brand />
          </Link>
        </div>

        {showNav && (
          <nav className="app-sidebar-nav" aria-label="Navigazione principale">
            {NAV_GROUPS.map((group) => (
              <div key={group.id} className="app-nav-group">
                <h2 className="app-nav-group-label">{group.label}</h2>
                <ul className="app-nav-list">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isNavItemActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="app-nav-link"
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon className="app-nav-icon" aria-hidden />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        )}

        <div className="app-sidebar-foot">
          {showNav && (
            <Link href="/crediti" className="app-credits-widget">
              <CoinsIcon className="app-credits-icon" aria-hidden />
              <span className="app-credits-body">
                <span className="app-credits-label">Crediti</span>
                <span className="app-credits-value">{credits}</span>
              </span>
              <span className="app-credits-cta">Gestisci</span>
            </Link>
          )}
          <form action={signOutAction} className="app-logout">
            <button type="submit" className="app-logout-btn">
              <LogOutIcon aria-hidden />
              <span>Esci</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
