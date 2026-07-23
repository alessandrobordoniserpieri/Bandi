import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeadlineBadge } from "../deadline-badge";
import { VerdictBadge } from "../verdict-badge";
import { ScoreBreakdown } from "../score-breakdown";
import { DocumentChecklist } from "../document-checklist";
import { GrantCard } from "../grant-card";
import { GrantTypeBadge } from "../grant-type-badge";
import type { BreakdownItem } from "@/lib/matching";
import type { MatchedGrant } from "@/lib/grants/match-list";

describe("DeadlineBadge", () => {
  it("renders each of the 4 colors from the indicator", () => {
    for (const color of ["verde", "giallo", "rosso", "nero"] as const) {
      const html = renderToStaticMarkup(
        <DeadlineBadge indicator={{ days: 5, color, label: `label-${color}` }} />,
      );
      expect(html).toContain(`data-color="${color}"`);
      expect(html).toContain(`label-${color}`);
    }
  });
});

describe("VerdictBadge", () => {
  it("renders the verdict text and data attribute", () => {
    const html = renderToStaticMarkup(<VerdictBadge verdict="Candidabile" />);
    expect(html).toContain("Candidabile");
    expect(html).toContain('data-verdict="Candidabile"');
  });

  it("carries an explanatory tooltip (title) for every verdict, not just the label", () => {
    const verdicts = [
      "Candidabile", "Da preparare", "Da valutare",
      "Bassa priorità", "Non compatibile", "Storico",
    ] as const;
    for (const verdict of verdicts) {
      const html = renderToStaticMarkup(<VerdictBadge verdict={verdict} />);
      const titleMatch = html.match(/title="([^"]*)"/);
      expect(titleMatch, `${verdict} has no title attribute`).not.toBeNull();
      expect(titleMatch![1].length).toBeGreaterThan(verdict.length);
    }
  });

  it("gives 'Non compatibile' an actionable next step, not a bare verdict (concept §6.3)", () => {
    const html = renderToStaticMarkup(<VerdictBadge verdict="Non compatibile" />);
    const titleMatch = html.match(/title="([^"]*)"/);
    expect(titleMatch![1]).toMatch(/aggiorna|cerca|altri bandi/i);
  });
});

describe("ScoreBreakdown", () => {
  it("renders exactly 6 progress bars with value/max and notes", () => {
    const items: BreakdownItem[] = [
      { key: "themes", label: "Temi", value: 20, max: 28, note: "n1" },
      { key: "legalForm", label: "Forma", value: 22, max: 22, note: "n2" },
      { key: "territory", label: "Territorio", value: 10, max: 18, note: "n3" },
      { key: "capacity", label: "Capacità", value: 9, max: 14, note: "n4" },
      { key: "documents", label: "Documenti", value: 8, max: 12, note: "n5" },
      { key: "trackRecord", label: "Storico", value: 3, max: 6, note: "n6" },
    ];
    const html = renderToStaticMarkup(<ScoreBreakdown breakdown={items} />);
    expect((html.match(/<progress/g) ?? []).length).toBe(6);
    expect(html).toContain("Temi");
    expect(html).toContain("value=\"20\"");
    expect(html).toContain("max=\"28\"");
    expect(html).toContain("n6");
  });
});

describe("DocumentChecklist", () => {
  it("lists missing documents under the italian heading", () => {
    const html = renderToStaticMarkup(<DocumentChecklist missing={["statuto", "durc"]} />);
    expect(html).toContain("Per candidarti ti manca");
    expect(html).toContain("statuto");
    expect(html).toContain("durc");
  });
  it("shows the all-clear message when nothing is missing AND documents are known", () => {
    const html = renderToStaticMarkup(<DocumentChecklist missing={[]} known={true} />);
    expect(html).toContain("Hai tutti i documenti richiesti");
  });
  it("shows 'non disponibili / consulta il bando' when documents are unknown (not a false all-clear)", () => {
    const html = renderToStaticMarkup(<DocumentChecklist missing={[]} known={false} />);
    expect(html).not.toContain("Hai tutti i documenti richiesti");
    expect(html).toContain("non disponibili");
    expect(html).toContain("bando");
  });
});

describe("GrantTypeBadge", () => {
  it("renders the co-progettazione label and data attribute", () => {
    const html = renderToStaticMarkup(<GrantTypeBadge grantType="co_progettazione" />);
    expect(html).toContain("Co-progettazione");
    expect(html).toContain('data-grant-type="co_progettazione"');
  });
  it("renders nothing for an ordinary bando", () => {
    const html = renderToStaticMarkup(<GrantTypeBadge grantType="bando" />);
    expect(html).toBe("");
  });
});

describe("GrantCard", () => {
  it("renders title link, provider, score and verdict", () => {
    const matched = {
      grant: {
        id: "g1", title: "Bando Sport 2026", providerId: "p", providerKind: "privato",
        deadline: "2026-12-31", status: "aperto", amount: 50000, cofundingRequired: null,
        cofundingPercentage: null, grantType: "co_progettazione",
        eligibleTypes: [], tags: [], area: null, geoScope: null, complexity: null,
        requiredDocuments: [], summary: "", requirements: "", url: "https://x", beneficiaries: "",
        openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
        eligibleExpenses: null, applicationMethod: null, contactInfo: null,
      },
      providerName: "Fondazione Test",
      match: {
        score: 82, baseScore: 82, verdict: "Candidabile", breakdown: [], bonuses: [],
        indicators: {
          deadline: { days: 180, color: "verde", label: "scade tra 180 giorni" },
          cofunding: { required: null, color: "grigio", label: "n/d" },
          economic: { ratio: null, level: "da_verificare", label: "da verificare", amount: 50000, budgetKnown: false },
        },
        historyBadge: null, missingDocuments: [], documentsKnown: false, actions: [],
      },
    } as unknown as MatchedGrant;
    const html = renderToStaticMarkup(<GrantCard matched={matched} />);
    expect(html).toContain("Bando Sport 2026");
    expect(html).toContain("Fondazione Test");
    expect(html).toContain("82");
    expect(html).toContain('data-verdict="Candidabile"');
    expect(html).toContain('href="/bandi/g1"');
    expect(html).toContain("Co-progettazione");
  });

  it("renders the score-bar colored by verdict via data-attribute, not hardcoded style", () => {
    const matched = {
      grant: { id: "g2", title: "Bando Cultura", providerId: "p", eligibleTypes: [], tags: [], requiredDocuments: [] },
      providerName: null,
      match: {
        score: 40, baseScore: 40, verdict: "Da preparare", breakdown: [], bonuses: [],
        indicators: {
          deadline: { days: 10, color: "giallo", label: "scade tra 10 giorni" },
          cofunding: { required: null, color: "grigio", label: "n/d" },
          economic: { ratio: null, level: "da_verificare", label: "da verificare", amount: null, budgetKnown: false },
        },
        historyBadge: null, missingDocuments: [], documentsKnown: false, actions: [],
      },
    } as unknown as MatchedGrant;
    const html = renderToStaticMarkup(<GrantCard matched={matched} />);
    expect(html).toContain("score-bar-fill");
    expect(html).toContain('data-verdict="Da preparare"');
    expect(html).toContain('width:40%');
  });

  it("passes the density mode through as a data-density attribute", () => {
    const matched = {
      grant: { id: "g3", title: "Bando Ambiente", providerId: "p", eligibleTypes: [], tags: [], requiredDocuments: [] },
      providerName: null,
      match: {
        score: 55, baseScore: 55, verdict: "Da valutare", breakdown: [], bonuses: [],
        indicators: {
          deadline: { days: 30, color: "verde", label: "scade tra 30 giorni" },
          cofunding: { required: null, color: "grigio", label: "n/d" },
          economic: { ratio: null, level: "da_verificare", label: "da verificare", amount: null, budgetKnown: false },
        },
        historyBadge: null, missingDocuments: [], documentsKnown: false, actions: [],
      },
    } as unknown as MatchedGrant;
    const html = renderToStaticMarkup(<GrantCard matched={matched} density="compact" />);
    expect(html).toContain('data-density="compact"');
  });
});
