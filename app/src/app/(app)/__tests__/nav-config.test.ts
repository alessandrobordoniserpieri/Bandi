import { describe, it, expect } from "vitest";
import { NAV_GROUPS, isNavItemActive } from "../nav-config";

describe("NAV_GROUPS", () => {
  const allItems = NAV_GROUPS.flatMap((g) => g.items);

  it("declares exactly the two DEC-3 groups in order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Bandi", "Il mio ente"]);
  });

  it("lists the operational 'Bandi' group entries in order", () => {
    const bandi = NAV_GROUPS[0];
    expect(bandi.items.map((i) => [i.label, i.href])).toEqual([
      ["Esplora bandi", "/"],
      ["I miei bandi", "/i-miei-bandi"],
      ["Scadenze", "/scadenze"],
      ["Assistente", "/assistente"],
    ]);
  });

  it("lists the 'Il mio ente' group entries in order", () => {
    const ente = NAV_GROUPS[1];
    expect(ente.items.map((i) => [i.label, i.href])).toEqual([
      ["Profilo ente", "/profilo"],
      ["Crediti & piano", "/crediti"],
      ["Notifiche", "/profilo#notifiche"],
      ["Impostazioni", "/impostazioni"],
    ]);
  });

  it("uses 'Esplora bandi' for the home route, never 'Dashboard'", () => {
    const home = allItems.find((i) => i.href === "/");
    expect(home?.label).toBe("Esplora bandi");
    expect(allItems.some((i) => /dashboard/i.test(i.label))).toBe(false);
  });

  it("gives every item an icon component", () => {
    for (const item of allItems) {
      expect(item.icon).toBeTruthy();
    }
  });
});

describe("isNavItemActive", () => {
  it("marks the home route active only on an exact '/' match", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/i-miei-bandi", "/")).toBe(false);
    expect(isNavItemActive("/scadenze", "/")).toBe(false);
  });

  it("marks a section active on its exact route", () => {
    expect(isNavItemActive("/i-miei-bandi", "/i-miei-bandi")).toBe(true);
    expect(isNavItemActive("/profilo", "/profilo")).toBe(true);
  });

  it("keeps a section active on nested sub-routes", () => {
    expect(isNavItemActive("/profilo/contatti", "/profilo")).toBe(true);
    expect(isNavItemActive("/i-miei-bandi/123", "/i-miei-bandi")).toBe(true);
  });

  it("does not match a sibling route that merely shares a prefix", () => {
    expect(isNavItemActive("/crediti-piano", "/crediti")).toBe(false);
  });

  it("never claims the current page for an in-page anchor entry", () => {
    // 'Notifiche' points at /profilo#notifiche and must not double-highlight
    // with 'Profilo ente' when the user is on /profilo.
    expect(isNavItemActive("/profilo", "/profilo#notifiche")).toBe(false);
  });
});
