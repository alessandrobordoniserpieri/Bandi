# Analisi AI forte V1 — Piano 5: Chat backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backend della chat per-bando (spec §5): assembla il contesto (profilo + PDF + storico
recente + domanda), chiama l'LLM, valida e persiste la conversazione in `chat_messages`, gated
dall'entitlement `chat_message` (~30/ora).

**Architecture:** Segue lo stesso pattern di `analyze-grant.ts` (output LLM **mai** renderizzato
raw: schema JSON minimale `{ risposta }`, validato con zod). `buildChatPrompt` riusa
`buildStrongAnalysisDocument` (Piano 4) per il blocco profilo+bando+PDF e aggiunge una finestra
recente dello storico, troncata a budget-token (spec §5: ~8.000 token **oppure** ultimi ~8 scambi
—16 messaggi—, il primo che scatta). Il DB conserva **sempre** la conversazione intera (RLS
owner-only, già in migration 0014); solo ciò che si manda all'LLM è potato. La route
`POST /api/ai/strong/chat` inserisce il messaggio utente, chiama l'LLM, inserisce la risposta —
se l'LLM fallisce il messaggio utente resta comunque salvato (l'utente può ritentare).

**Tech Stack:** TypeScript, zod, vitest, `checkEntitlement` (Piano 1), `LLMProvider` (esistente).

## Global Constraints

- Lingua UI: italiano. Codice e commenti: inglese.
- Spec di riferimento: `docs/superpowers/specs/2026-07-20-strong-ai-analysis-rag-v1-design.md` §5, §8.
- Login + profilo obbligatori (spec §8), stesso pattern delle altre route `strong/*`.
- L'output del provider non è mai renderizzato raw: schema+zod, stesso principio di
  `analyze-grant.ts`.
- Nessun gate lato backend su "readiness" del bando: se non ci sono documenti pronti, la chat
  funziona comunque sul solo profilo+bando (degrado silenzioso, stesso spirito di `/api/ai/analyze`
  quando non ci sono PDF). Il gate "mostra la chat solo a stato 3" è responsabilità della UI
  (Piano 6), non del backend.
- `chat_messages`: scrittura via client utente (RLS owner-only lo permette già, nessun bisogno di
  `createAdminClient`).

---

## File Structure (Piano 5)

- Create: `app/src/lib/ai/chat.ts` — `ChatTurn`, `buildChatPrompt`, `runChatTurn`.
- Create: `app/src/lib/ai/__tests__/chat.test.ts`
- Create: `app/src/app/api/ai/strong/chat/route.ts`
- Create: `app/src/app/api/ai/strong/__tests__/chat-route.test.ts`

---

## Task 1: `buildChatPrompt` + `runChatTurn`

**Files:**
- Create: `app/src/lib/ai/chat.ts`
- Test: `app/src/lib/ai/__tests__/chat.test.ts`

**Interfaces:**
- Consumes: `buildStrongAnalysisDocument`, `DocumentText`, `AnalysisProfileInput` (Piano 4/1),
  `LLMProvider` (esistente).
- Produces:
  - `interface ChatTurn { role: "user" | "assistant"; content: string }`
  - `function selectRecentHistory(history: ChatTurn[]): ChatTurn[]`
  - `function buildChatPrompt(input, grant, providerName, documents: DocumentText[], history: ChatTurn[], question: string): string`
  - `async function runChatTurn(llm: LLMProvider, input, grant, providerName, documents, history, question): Promise<string>`
  - consumato dalla route (Task 2).

- [ ] **Step 1: Scrivere i test**

Create `app/src/lib/ai/__tests__/chat.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildChatPrompt, runChatTurn, selectRecentHistory, type ChatTurn } from "../chat";
import type { AnalysisProfileInput } from "../analyze-grant";
import type { LLMProvider } from "../provider";
import type { EntityProfile, Grant } from "@/lib/matching";

const profile: EntityProfile = {
  legalType: "APS - Associazione di Promozione Sociale",
  province: "BO", region: "Emilia-Romagna", operatingProvinces: [],
  themes: ["sport"], capacity: null,
  documents: { statuto: true, bilancio: true, runts: false, rasd: false, durc: false, certificazioni: false },
  publicPartners: true, privatePartners: false, projectHistory: [], fundingTypesReceived: [],
  cofundingCapacity: 20,
};
const input: AnalysisProfileInput = { profile, name: "ASD Futuro", activityDescription: "Sport" };
const grant: Grant = {
  id: "g1", title: "Bando Sport", providerId: null, providerKind: null, deadline: null,
  status: "aperto", grantType: "bando", amount: null, cofundingRequired: null,
  cofundingPercentage: null, eligibleTypes: [], tags: [], area: null, geoScope: null,
  complexity: null, requiredDocuments: [], summary: "", requirements: "", url: "https://x",
  beneficiaries: "", openingDate: null, fundingType: null, minAmount: null, maxAmount: null,
  eligibleExpenses: null, applicationMethod: null, contactInfo: null,
};

describe("selectRecentHistory", () => {
  it("keeps at most the last 16 messages", () => {
    const history: ChatTurn[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `messaggio ${i}`,
    }));
    const recent = selectRecentHistory(history);
    expect(recent.length).toBe(16);
    expect(recent[0]!.content).toBe("messaggio 4"); // the last 16 of 20 -> starts at index 4
    expect(recent[recent.length - 1]!.content).toBe("messaggio 19");
  });

  it("drops the oldest messages first when the token budget (~8000) is exceeded", () => {
    // Each message ~3000 tokens (12000 chars @ ~4 chars/token): budget fits 2, not 3.
    const big = "x".repeat(12_000);
    const history: ChatTurn[] = [
      { role: "user", content: big },
      { role: "assistant", content: big },
      { role: "user", content: big },
    ];
    const recent = selectRecentHistory(history);
    expect(recent.length).toBe(2);
    expect(recent[0]!.content).toBe(big);
    expect(recent).toEqual(history.slice(1)); // the OLDEST of the three was dropped
  });

  it("returns everything unchanged when short and few", () => {
    const history: ChatTurn[] = [{ role: "user", content: "ciao" }, { role: "assistant", content: "ciao a te" }];
    expect(selectRecentHistory(history)).toEqual(history);
  });
});

describe("buildChatPrompt", () => {
  it("includes the profile+grant block, the recent history, and the new question", () => {
    const history: ChatTurn[] = [{ role: "user", content: "Chi può partecipare?" }, { role: "assistant", content: "Le APS." }];
    const prompt = buildChatPrompt(input, grant, "Fondazione Test", [], history, "E il cofinanziamento?");
    expect(prompt).toContain("ASD Futuro"); // profile block
    expect(prompt).toContain("Bando Sport"); // grant block
    expect(prompt).toContain("Chi può partecipare?");
    expect(prompt).toContain("Le APS.");
    expect(prompt).toContain("E il cofinanziamento?");
  });

  it("includes the full document text when documents are given", () => {
    const prompt = buildChatPrompt(input, grant, null, [{ title: "Avviso.pdf", text: "Clausola XYZ999" }], [], "domanda");
    expect(prompt).toContain("Clausola XYZ999");
  });
});

describe("runChatTurn", () => {
  it("returns the validated reply from the provider", async () => {
    const llm: LLMProvider = { name: "stub", extract: async () => ({ risposta: "Sì, le APS possono partecipare." }) };
    const reply = await runChatTurn(llm, input, grant, null, [], [], "Chi può partecipare?");
    expect(reply).toBe("Sì, le APS possono partecipare.");
  });

  it("accepts a JSON string payload", async () => {
    const llm: LLMProvider = { name: "stub", extract: async () => JSON.stringify({ risposta: "Ok." }) };
    const reply = await runChatTurn(llm, input, grant, null, [], [], "domanda");
    expect(reply).toBe("Ok.");
  });

  it("throws on malformed output (never rendered raw)", async () => {
    const llm: LLMProvider = { name: "stub", extract: async () => ({ risposta: "" }) };
    await expect(runChatTurn(llm, input, grant, null, [], [], "domanda")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Eseguire i test per verificarli fallire**

Run: `cd app && npx vitest run src/lib/ai/__tests__/chat.test.ts`
Expected: FAIL — `Cannot find module '../chat'`.

- [ ] **Step 3: Implementare**

Create `app/src/lib/ai/chat.ts`:

```typescript
// app/src/lib/ai/chat.ts
// Per-grant advisory chat (spec §5). The LLM is stateless: we assemble the full context on every
// turn — profile+grant+PDF text (shared, cacheable), a token-budgeted recent history window, and
// the new question. Output is never rendered raw: a minimal JSON schema + zod, same principle as
// analyze-grant.ts.
import { z } from "zod";
import type { LLMProvider, JsonSchema } from "./provider";
import type { EntityProfile, Grant } from "@/lib/matching";
import { buildStrongAnalysisDocument, type AnalysisProfileInput, type DocumentText } from "./analyze-grant";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Rough estimate (~4 chars/token), consistent with the pragmatic sizing already used for chunking
// elsewhere in this codebase — good enough for a soft budget, not billing-accurate.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const HISTORY_TOKEN_BUDGET = 8_000;
const HISTORY_MAX_TURNS = 16; // ~8 exchanges

// Keeps the most recent turns, capped at HISTORY_MAX_TURNS, then trimmed further so the total
// stays under HISTORY_TOKEN_BUDGET — whichever limit bites first. Older turns are dropped from
// what's SENT to the LLM; the full conversation still lives in chat_messages (route, Task 2).
export function selectRecentHistory(history: ChatTurn[]): ChatTurn[] {
  const capped = history.slice(-HISTORY_MAX_TURNS);
  const result: ChatTurn[] = [];
  let tokens = 0;
  for (let i = capped.length - 1; i >= 0; i--) {
    const t = estimateTokens(capped[i]!.content);
    if (tokens + t > HISTORY_TOKEN_BUDGET) break;
    tokens += t;
    result.unshift(capped[i]!);
  }
  return result;
}

export function buildChatPrompt(
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
  documents: DocumentText[],
  history: ChatTurn[],
  question: string,
): string {
  const base = buildStrongAnalysisDocument(input, grant, providerName, documents);
  const recent = selectRecentHistory(history);
  const historyLines = recent.map((t) => `${t.role === "user" ? "UTENTE" : "ASSISTENTE"}: ${t.content}`);
  return [
    base,
    "",
    "== STORICO CONVERSAZIONE (finestra recente) ==",
    ...(historyLines.length ? historyLines : ["(nessuno storico precedente)"]),
    "",
    "== NUOVA DOMANDA DELL'UTENTE ==",
    question,
  ].join("\n");
}

const chatResponseSchema = z.object({ risposta: z.string().trim().min(1) });

const CHAT_JSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: { risposta: { type: "string" } },
  required: ["risposta"],
};

export const CHAT_INSTRUCTIONS = [
  "Sei un consulente esperto di bandi per il Terzo Settore italiano (D.Lgs 117/2017), in una",
  "chat con un rappresentante dell'ente. Presta molta attenzione al profilo dell'ente fornito.",
  "Rispondi in italiano, in modo colloquiale ma preciso, citando elementi concreti del profilo e",
  "del bando quando pertinenti — niente frasi generiche. Se il testo dei documenti allegati è",
  "presente, fondati su quello per le risposte specifiche.",
  "Rispondi SOLO con un oggetto JSON con la chiave: risposta (stringa, la tua risposta).",
].join(" ");

export async function runChatTurn(
  llm: LLMProvider,
  input: AnalysisProfileInput,
  grant: Grant,
  providerName: string | null,
  documents: DocumentText[],
  history: ChatTurn[],
  question: string,
): Promise<string> {
  let raw = await llm.extract({
    html: buildChatPrompt(input, grant, providerName, documents, history, question),
    schema: CHAT_JSON_SCHEMA,
    instructions: CHAT_INSTRUCTIONS,
  });
  if (typeof raw === "string") raw = JSON.parse(raw);
  const parsed = chatResponseSchema.parse(raw);
  return parsed.risposta;
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/lib/ai/__tests__/chat.test.ts`
Expected: PASS (9 test).

- [ ] **Step 5: Typecheck**

Run: `cd app && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/ai/chat.ts app/src/lib/ai/__tests__/chat.test.ts
git commit -m "feat(ai): buildChatPrompt/runChatTurn — token-budgeted chat context assembly"
```

---

## Task 2: Route `POST /api/ai/strong/chat`

**Files:**
- Create: `app/src/app/api/ai/strong/chat/route.ts`
- Test: `app/src/app/api/ai/strong/__tests__/chat-route.test.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `getGrant`, `getProvider`, `runChatTurn`
  (Task 1), `checkEntitlement` (Piano 1).
- Produces: `POST` handler, `{ reply: string }` su successo.

- [ ] **Step 1: Scrivere il test della route**

Create `app/src/app/api/ai/strong/__tests__/chat-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const from = vi.fn();
const checkEntitlement = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}));
vi.mock("@/lib/ai/entitlement", () => ({ checkEntitlement: (...a: unknown[]) => checkEntitlement(...a) }));
vi.mock("@/lib/grants/queries", () => ({ getGrant: vi.fn() }));
vi.mock("@/lib/ai/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/provider")>("@/lib/ai/provider");
  return { ...actual, getProvider: vi.fn() };
});

import { POST } from "../chat/route";
import { getGrant } from "@/lib/grants/queries";
import { getProvider } from "@/lib/ai/provider";
import type { GrantView } from "@/lib/grants/mapping";

function post(body: unknown): Request {
  return new Request("http://localhost/api/ai/strong/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const grantView = {
  grant: { id: "g1", title: "Bando", attachments: [] },
  providerName: null,
} as unknown as GrantView;

const profileRow = {
  user_id: "u1", legal_type: "APS", themes: [], operating_provinces: [],
  project_history: [], income_sources: [], beneficiaries: [],
};

let insertedRows: Record<string, unknown>[] = [];

function mockTables(opts: { documentRows?: unknown[]; historyRows?: unknown[] } = {}) {
  insertedRows = [];
  from.mockImplementation((table: string) => {
    if (table === "profiles") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow }) }) }) };
    }
    if (table === "grant_documents") {
      return { select: () => ({ eq: () => ({ eq: async () => ({ data: opts.documentRows ?? [] }) }) }) };
    }
    if (table === "chat_messages") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: opts.historyRows ?? [] }) }) }) }),
        insert: (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return Promise.resolve({ error: null });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  getUser.mockReset();
  from.mockReset();
  checkEntitlement.mockReset();
  vi.mocked(getGrant).mockReset();
  vi.mocked(getProvider).mockReset();
});

describe("POST /api/ai/strong/chat", () => {
  it("returns 401 when unauthenticated", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(post({ grantId: "g1", message: "ciao" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when message or grantId is missing", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(post({ grantId: "g1" }));
    expect(res.status).toBe(400);
  });

  it("returns 429 when the hourly chat entitlement is exhausted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables();
    checkEntitlement.mockResolvedValue({ allowed: false });
    const res = await POST(post({ grantId: "g1", message: "ciao" }));
    expect(res.status).toBe(429);
  });

  it("returns 404 when the grant does not exist", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables();
    checkEntitlement.mockResolvedValue({ allowed: true });
    vi.mocked(getGrant).mockResolvedValue(null);
    const res = await POST(post({ grantId: "missing", message: "ciao" }));
    expect(res.status).toBe(404);
  });

  it("persists the user message, calls the LLM with history+documents, persists the reply", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables({
      documentRows: [{ attachment_url: "https://x/a.pdf", extracted_text: "Testo XYZ999" }],
      historyRows: [{ role: "user", content: "Prima domanda" }, { role: "assistant", content: "Prima risposta" }],
    });
    checkEntitlement.mockResolvedValue({ allowed: true });
    vi.mocked(getGrant).mockResolvedValue(grantView);
    let capturedHtml = "";
    vi.mocked(getProvider).mockReturnValue({
      name: "stub",
      extract: async (args: { html: string }) => {
        capturedHtml = args.html;
        return { risposta: "Ecco la risposta." };
      },
    });

    const res = await POST(post({ grantId: "g1", message: "Seconda domanda?" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("Ecco la risposta.");
    expect(capturedHtml).toContain("Testo XYZ999");
    expect(capturedHtml).toContain("Prima domanda");
    expect(capturedHtml).toContain("Seconda domanda?");
    expect(insertedRows).toEqual([
      { grant_id: "g1", user_id: "u1", role: "user", content: "Seconda domanda?" },
      { grant_id: "g1", user_id: "u1", role: "assistant", content: "Ecco la risposta." },
    ]);
  });

  it("returns 502 (user message still persisted) when the LLM call fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockTables();
    checkEntitlement.mockResolvedValue({ allowed: true });
    vi.mocked(getGrant).mockResolvedValue(grantView);
    vi.mocked(getProvider).mockReturnValue({
      name: "stub",
      extract: async () => { throw new Error("provider down"); },
    });

    const res = await POST(post({ grantId: "g1", message: "ciao" }));

    expect(res.status).toBe(502);
    expect(insertedRows).toEqual([{ grant_id: "g1", user_id: "u1", role: "user", content: "ciao" }]);
  });
});
```

- [ ] **Step 2: Eseguire il test per verificarlo fallire**

Run: `cd app && npx vitest run src/app/api/ai/strong/__tests__/chat-route.test.ts`
Expected: FAIL — `Cannot find module '../chat/route'`.

- [ ] **Step 3: Implementare**

Create `app/src/app/api/ai/strong/chat/route.ts`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { rowToEntityProfile, type ProfileRow } from "@/lib/profile/schema";
import { getGrant } from "@/lib/grants/queries";
import { getProvider } from "@/lib/ai/provider";
import { runChatTurn, type ChatTurn } from "@/lib/ai/chat";
import type { DocumentText } from "@/lib/ai/analyze-grant";
import { checkEntitlement } from "@/lib/ai/entitlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One turn of the per-grant advisory chat (spec §5). The user's message is persisted before the
// LLM call so it's never lost if the call fails; the assistant reply is persisted only on success.
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non autenticato." }, { status: 401 });

  let grantId: unknown, message: unknown;
  try {
    ({ grantId, message } = await request.json());
  } catch {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (typeof grantId !== "string" || !grantId || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Richiesta non valida." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!profile) return Response.json({ error: "Completa prima il tuo profilo." }, { status: 404 });

  const { allowed } = await checkEntitlement(supabase, user.id, "chat_message");
  if (!allowed) {
    return Response.json(
      { error: "Hai raggiunto il limite orario di messaggi. Riprova più tardi." },
      { status: 429 },
    );
  }

  const view = await getGrant(grantId);
  if (!view) return Response.json({ error: "Bando non trovato." }, { status: 404 });

  const [{ data: docRows }, { data: historyRows }] = await Promise.all([
    supabase.from("grant_documents").select("attachment_url, extracted_text").eq("grant_id", grantId).eq("status", "ready"),
    supabase.from("chat_messages").select("role, content").eq("grant_id", grantId).eq("user_id", user.id).order("created_at"),
  ]);

  const documents: DocumentText[] = (docRows ?? [])
    .filter((d): d is { attachment_url: string; extracted_text: string } => Boolean(d.extracted_text))
    .map((d) => ({
      title: view.grant.attachments?.find((a) => a.url === d.attachment_url)?.title ?? d.attachment_url,
      text: d.extracted_text,
    }));
  const history: ChatTurn[] = (historyRows ?? []) as ChatTurn[];

  await supabase.from("chat_messages").insert({ grant_id: grantId, user_id: user.id, role: "user", content: message });

  const row = profile as ProfileRow;
  try {
    const reply = await runChatTurn(
      getProvider(process.env),
      { profile: rowToEntityProfile(row), name: row.name, activityDescription: row.activity_description },
      view.grant,
      view.providerName,
      documents,
      history,
      message,
    );
    await supabase.from("chat_messages").insert({ grant_id: grantId, user_id: user.id, role: "assistant", content: reply });
    return Response.json({ reply });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/strong/chat] failed:", msg);
    const isRateLimit = msg.includes("429");
    return Response.json(
      {
        error: isRateLimit
          ? "Il provider AI ha raggiunto il limite di richieste. Riprova tra qualche minuto."
          : "Risposta non riuscita. Riprova tra qualche istante.",
      },
      { status: isRateLimit ? 429 : 502 },
    );
  }
}
```

- [ ] **Step 4: Eseguire i test per verificarli passare**

Run: `cd app && npx vitest run src/app/api/ai/strong/__tests__/chat-route.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Typecheck e suite completa**

Run: `cd app && npx tsc --noEmit && npm test`
Expected: nessun errore, tutti i test passano.

- [ ] **Step 6: Commit**

```bash
git add app/src/app/api/ai/strong/chat/route.ts app/src/app/api/ai/strong/__tests__/chat-route.test.ts
git commit -m "feat(ai): POST /api/ai/strong/chat — persisted per-grant advisory chat turn"
```

---

## Task 3: Verifica finale + documentazione

- [ ] **Step 1: Suite completa app + scraper**

Run: `cd app && npx tsc --noEmit && npm test && cd ../scraper && npm run typecheck`
Expected: tutto verde.

- [ ] **Step 2: Commit del piano**

```bash
git add docs/superpowers/plans/2026-07-21-strong-ai-v1-05-chat-backend.md
git commit -m "docs(plan): strong AI analysis V1 — plan 5/6 (chat backend)"
```

---

## Self-Review (Piano 5)

- **Copertura spec:** §5 contesto (profilo+PDF+storico+domanda) → `buildChatPrompt`. Troncamento
  budget-token (~8000 **o** 16 messaggi, il primo che scatta) → `selectRecentHistory`. Persistenza
  per-utente, intera conversazione in DB → route Task 2 (insert su `chat_messages`, mai un
  DELETE/troncamento lato DB). Separazione privacy (profilo mai nell'artefatto condiviso) →
  rispettata: il profilo è iniettato solo nel prompt a runtime, mai scritto in `grant_documents`.
  §8 secchiello `chat_message` (~30/ora) → `checkEntitlement` nella route. Coperto.
- **Fuori scope (corretto):** UI (card, input, prompt suggeriti) → Piano 6.
- **Placeholder:** nessun TBD; codice e test completi.
- **Consistenza tipi:** `ChatTurn`, `buildChatPrompt`, `runChatTurn` usati identici tra
  `chat.ts`, il suo test, e la route. Le colonne lette/scritte su `chat_messages`
  (`role`, `content`, `grant_id`, `user_id`) combaciano con lo schema (migration 0014).
