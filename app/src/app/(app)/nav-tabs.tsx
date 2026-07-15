"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/nuovi-bandi", label: "Nuovi bandi" },
  { href: "/i-miei-bandi", label: "I miei bandi" },
  { href: "/profilo", label: "Profilo" },
];

export function NavTabs() {
  const pathname = usePathname();
  return (
    <div className="app-tabs">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
