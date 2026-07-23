import type { LucideIcon } from "lucide-react";
import {
  BellIcon,
  BookmarkIcon,
  Building2Icon,
  ClockIcon,
  CompassIcon,
  SettingsIcon,
  SparklesIcon,
  WalletIcon,
} from "lucide-react";

// Single source of truth for the global sidebar (DEC-3). Kept as plain data +
// a pure predicate so the structure and active-route logic are unit-testable
// without a router. UI strings are Italian; identifiers/comments English.

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGroup = {
  id: string;
  /** Human label; the sidebar renders it as an uppercase group heading via CSS. */
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "bandi",
    label: "Bandi",
    items: [
      // Ex-dashboard + nuovi-bandi, unified (DEC-1). Never labelled "Dashboard".
      { href: "/", label: "Esplora bandi", icon: CompassIcon },
      { href: "/i-miei-bandi", label: "I miei bandi", icon: BookmarkIcon },
      { href: "/scadenze", label: "Scadenze", icon: ClockIcon },
      { href: "/assistente", label: "Assistente", icon: SparklesIcon },
    ],
  },
  {
    id: "ente",
    label: "Il mio ente",
    items: [
      { href: "/profilo", label: "Profilo ente", icon: Building2Icon },
      { href: "/crediti", label: "Crediti & piano", icon: WalletIcon },
      // Notifiche live inside the profile for now (DEC-14): deep-link straight to
      // that sub-section via the profile sub-nav param (DEC-4).
      { href: "/profilo?sezione=notifiche", label: "Notifiche", icon: BellIcon },
      { href: "/impostazioni", label: "Impostazioni", icon: SettingsIcon },
    ],
  },
];

/**
 * Whether a nav entry should be marked as the current page for `pathname`.
 *
 * - The home route ("/") matches only exactly, so it does not stay lit on every
 *   sub-route.
 * - Section routes match their own path and any nested sub-route
 *   (e.g. "/profilo/contatti"), guarding against bare prefix collisions
 *   ("/crediti" must not match "/crediti-piano").
 * - In-page entries — a hash anchor or a query-scoped sub-section (href with a
 *   "#" or "?") — never claim the current page, so "Notifiche"
 *   (/profilo?sezione=notifiche) does not double-highlight with "Profilo ente"
 *   (/profilo).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href.includes("#") || href.includes("?")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
