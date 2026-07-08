import { describe, it, expect } from "vitest";
import { runDigestBatch, type DigestBatchDeps, type Recipient } from "../run-batch";
import { renderDigestEmail } from "../render-email";
import { FakeEmailSender } from "../send";
import type { ProfileRow } from "@/lib/profile/schema";
import type { GrantView } from "@/lib/grants/mapping";
import type { Grant } from "@/lib/matching";

const profileRow = (): ProfileRow => ({
  id: "p", user_id: "u", name: "Ente", legal_type: "APS - Associazione di Promozione Sociale",
  founded_year: null, tax_code: null, website: null,
  province: "BO", region: "Emilia-Romagna", municipality: null, operating_scope: null, operating_provinces: [],
  themes: ["sport", "giovani", "cultura", "sociale"], activity_description: null, beneficiaries: [],
  stable_staff: null, dedicated_admin: null, funded_projects_3y: null, reporting_experience: null,
  annual_budget: null, eu_project: null,
  doc_statuto: true, doc_bilancio: true, doc_runts: true, doc_rasd: false, doc_durc: false, doc_certificazioni: false,
  sport_body: null, rasd_number: null,
  public_partners: false, public_partners_detail: null, private_partners: false, private_partners_detail: null,
  networks: null, coprogettazione: false,
  project_history: [], public_funds: false, private_funds: false, eu_funds: false,
  cofunding_capacity: null, income_sources: [],
  contact_name: null, contact_role: null, contact_email: null, contact_phone: null, notes: null,
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
} as unknown as ProfileRow);

const strongView = (id: string): GrantView => {
  const grant: Grant = {
    id, title: `Bando ${id}`, providerId: null, providerKind: null, deadline: "2026-12-31",
    status: "aperto", amount: 50000, cofundingRequired: null,
    eligibleTypes: ["APS - Associazione di Promozione Sociale"], tags: ["sport", "giovani", "cultura", "sociale"],
    area: "Emilia-Romagna", geoScope: "regionale", complexity: "bassa",
    requiredDocuments: [], summary: "", requirements: "", url: `https://x/${id}`, beneficiaries: "",
  };
  return { grant, providerName: "Fondazione Test" };
};

function makeDeps(over: Partial<DigestBatchDeps> & { recipients: Recipient[]; sender: FakeEmailSender }): DigestBatchDeps {
  return {
    appUrl: "https://app.test",
    sender: over.sender,
    listRecipients: async () => over.recipients,
    getProfileRow: over.getProfileRow ?? (async () => profileRow()),
    getEmail: over.getEmail ?? (async (id) => `${id}@example.it`),
    getNewGrantViews: over.getNewGrantViews ?? (async () => [strongView("g1")]),
  };
}

describe("runDigestBatch", () => {
  it("sends a digest to a recipient with qualifying grants", async () => {
    const sender = new FakeEmailSender();
    const res = await runDigestBatch(makeDeps({ recipients: [{ userId: "u1", threshold: 40 }], sender }));
    expect(res).toEqual({ sent: 1, skipped: 0, errors: 0 });
    expect(sender.sent[0]!.to).toBe("u1@example.it");
    expect(sender.sent[0]!.html).toContain("/bandi/g1");
  });

  it("skips (no email) a recipient whose grants are all below threshold", async () => {
    const sender = new FakeEmailSender();
    const res = await runDigestBatch(makeDeps({ recipients: [{ userId: "u1", threshold: 100 }], sender }));
    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(1);
    expect(sender.sent).toHaveLength(0);
  });

  it("empty recipient list (e.g. everyone off) sends nothing", async () => {
    const sender = new FakeEmailSender();
    const res = await runDigestBatch(makeDeps({ recipients: [], sender }));
    expect(res).toEqual({ sent: 0, skipped: 0, errors: 0 });
    expect(sender.sent).toHaveLength(0);
  });

  it("one recipient failing does not block the others", async () => {
    const sender = new FakeEmailSender();
    const deps = makeDeps({
      recipients: [{ userId: "bad", threshold: 40 }, { userId: "good", threshold: 40 }],
      sender,
      getProfileRow: async (id) => {
        if (id === "bad") throw new Error("db down");
        return profileRow();
      },
    });
    const res = await runDigestBatch(deps);
    expect(res).toEqual({ sent: 1, skipped: 0, errors: 1 });
    expect(sender.sent.map((m) => m.to)).toEqual(["good@example.it"]);
  });
});

describe("renderDigestEmail", () => {
  it("produces an Italian subject, item links and a preferences link", () => {
    const { subject, html } = renderDigestEmail(
      { threshold: 50, items: [{ grantId: "g1", title: "Bando <Sport>", providerName: "Fondazione", score: 82, verdict: "Candidabile", deadline: "2026-12-31" }] },
      "https://app.test",
    );
    expect(subject).toBe("1 nuovo bando per te");
    expect(html).toContain("https://app.test/bandi/g1");
    expect(html).toContain("https://app.test/profilo");
    expect(html).toContain("Bando &lt;Sport&gt;"); // escaped
  });
});
