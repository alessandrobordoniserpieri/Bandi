# Regione Emilia-Romagna — sport/bandi as a candidate data source

> **Note on convention**: `docs/superpowers/research/` did not exist before this file. It is a new
> sibling to `docs/superpowers/specs/` and `docs/superpowers/plans/`, for primary-source
> investigation notes that precede a design doc. This file follows the naming pattern
> `<YYYY-MM-DD>-<topic>.md`.

Investigated live, 2026-07-20, via `curl` (raw HTTP, no paraphrasing) against the production site.
Today's date for "is this still open" judgments: **2026-07-20**.

## Verdict / Summary

- **Same platform: YES.** `https://www.regione.emilia-romagna.it/sport/bandi` is a section
  ("subsite") of the same Plone 6 / Volto CMS family as `sociale.regione.emilia-romagna.it`. The
  page emits `<meta name="generator" content="Plone 6 - https://plone.org"/>`, a Volto `id="main"`
  shell, and body classes `subsite subsite-rer-gray` (§1). The official Plone REST API
  (`@search`) works and returns the exact Plone JSON shape (`@id`, `batching`, `items`,
  `items_total`) (§1), and — critically — the **same `portal_type=Bando` content type with the
  same metadata field names** (`scadenza_bando`, `destinatari`, `materie`, `bando_state`,
  `tipologia_bando`) used by the already-scraped sociale source (§2). Detail objects fetched via
  the item's own `@id` with `Accept: application/json` return the same field family
  (`apertura_bando`, `chiusura_procedimento_bando`, `riferimenti`, `text` Slate blocks,
  `approfondimento` attachments) (§4).
- **Overlap with "Bandi Sociale": NO.** Sport bandi are a distinct subject domain (sport funding
  vs. terzo-settore/welfare funding) under a distinct URL path (`/sport/bandi/...` vs.
  `/leggi-atti-bandi/bandi/...`). A keyword search of the sociale `@search` endpoint for "sport"
  returns zero hits, and manual title comparison against sociale's full 25-item Bando list shows
  no shared titles or URLs (§5). Treat as an independent, non-overlapping source — no dedup rule
  needed (unlike the sportesalute/sport-governo precedent).
- **Recommended approach: reuse the `er-sociale` archetype's plumbing (parser + `DirectFetcher`
  fetch mode), as a new source config, NOT a brand-new archetype** — but with two small,
  source-specific additions before treating it as a drop-in: (a) the transcoding tables
  (`destinatari`→`eligibleTypes`, `materie`→`tags`) need extending for two new tokens this source
  actually uses (`"Scuole"`, `"Università"`, `"Enti di formazione"` in `destinatari` — sociale's
  table has no entries for these); (b) `slateText()` currently drops `callout_block` nodes
  (no top-level `plaintext` key) — seen once in the 3 sampled details, containing a real
  eligibility-exclusion rule, so it should be taught to read `callout_block.text` too if full
  fidelity is wanted (§6). Full detail below.

## Blockers encountered

None that blocked the investigation. Minor notes:
- `GET /sport/bandi/@types` → `401 Unauthorized` (Plone's `@types` endpoint requires auth on this
  site — same as most anonymous Plone deployments; not needed anyway since `@search` +
  `portal_type=Bando` already answers the schema question empirically).
- Response headers include `Server: Server`, `X-AspNet-Version: X-AspNet-Version`,
  `X-Powered-By: X-Powered-By` — literally the header *names* as values, not real version
  strings. This looks like a WAF/reverse-proxy stripping/obfuscating real values (security
  through obscurity) rather than evidence of an actual ASP.NET backend; the page body's Plone
  generator tag and the working Plone REST API responses are the authoritative signal, and both
  are unambiguous.
- No rate limiting or 429s encountered on any of the ~10 requests made.

---

## 1. Same underlying platform (Plone/Volto) or not?

**Rendered HTML fetch:**

```
curl -sS -D - -o /tmp/rer_sport_bandi.html "https://www.regione.emilia-romagna.it/sport/bandi"
```
Headers (200 OK, `content-type: text/html; charset=utf-8`, `Content-Length: 2676075` — a ~2.6MB
Volto app page, same order of magnitude as sociale's documented ~12MB):
```
Server: Server
X-AspNet-Version: X-AspNet-Version
X-AspNetMvc-Version: X-AspNetMvc-Version
X-Powered-By: X-Powered-By
```
(see "Blockers" above re: these being placeholder values, not a real signal of ASP.NET).

Page-source markers (`grep` over the fetched HTML):
```
<meta name="generator" content="Plone 6 - https://plone.org"/>
```
```
<body class="view-viewview contenttype-document section-sport section-bandi is-anonymous
public-ui no-user-roles subsite subsite-rer-gray">
```
```
...<div role="navigation" aria-label="Toolbar" id="toolbar"></div><div id="main">
<div class="public-ui"><div class="skiplinks"><a class="visually-hidden visually-hidden-focusable"
href="#view">Vai al contenuto</a>...
```
27 occurrences of "Plone", 12 of "Volto" (case-sensitive), 90/26 case-insensitive, in the raw
HTML. `section-sport section-bandi` and `subsite subsite-rer-gray` confirm this is a themed
**section/subsite of one Plone deployment**, exactly the pattern Volto uses for "subsites" (a
built-in Volto feature for giving a folder its own nav/theme within one site).

**REST API probes** (all with `-H "Accept: application/json"`):

- `GET https://www.regione.emilia-romagna.it/sport/bandi/@search` → `200`, `content-type:
  application/json`, body starts:
  ```json
  {
    "@id": "https://www.regione.emilia-romagna.it/sport/bandi/@search",
    "batching": {
      "@id": "https://www.regione.emilia-romagna.it/sport/bandi/@search",
      "first": "...@search?b_start=0",
      "last": "...@search?b_start=75",
      "next": "...@search?b_start=25"
    },
    "items": [ ... ]
  }
  ```
  This is the canonical Plone REST API search response shape (`@id`/`batching`/`items`), byte-for-byte
  the same family as the sociale endpoint documented in the design doc.
- `GET https://www.regione.emilia-romagna.it/sport/@search` → `200`, same shape (325 items behind
  batching — the whole `/sport` section, not just `/sport/bandi`).
- `GET https://www.regione.emilia-romagna.it/@search?b_size=1` → `200`, same shape; `items_total`
  implied ~32,489 (`last: "...@search?b_start=32488&b_size=1"`) — confirms the bare site root is
  one large Plone instance, not something bando-specific.
- `GET https://www.regione.emilia-romagna.it/sport/bandi` with `Accept: application/json` (no
  `@search`) → `200`, returns the **folder object itself** (not a search result): `@type:
  "Document"`, `is_folderish: true`, `items_total: 5`, `items` = its 5 direct children (a PDF
  guide + year folders "2026"/"2025"/etc.) — i.e. the single-object JSON view works exactly like
  Plone/Volto's content-negotiation convention, and confirms `/sport/bandi` itself is a listing
  *folder page*, not a Bando.
- `GET https://www.regione.emilia-romagna.it/sport/bandi/@types` → `401 {"message":
  "Unauthorized()", "type": "Unauthorized"}` — expected for anonymous Plone; not needed since
  `@search` already answers the schema question directly.

**Conclusion**: unambiguously Plone 6/Volto, same REST API family as `sociale.regione.emilia-romagna.it`, exposed as a themed subsite/section (`/sport`, `/sport/bandi`) of the main `www.regione.emilia-romagna.it` Plone site rather than a separate subdomain-per-Zope-site the way sociale is. (One detail JSON's internal `approfondimento[].path` field literally starts `/Plone/sport/bandi/...` — `Plone` being the classic Zope site-root id — consistent with this being one Plone site object reachable at the `www` host.)

## 2. Content structure: portal_type, metadata fields

Unfiltered `GET /sport/bandi/@search` (no `portal_type` filter) returns `items_total: 77` with a
mix of `@type` values in the first page (`b_size` default 25):
```
Link: 3, Bando: 5, "Bando Folder Deepening": 13, File: 1, LinkNormativa: 1, Document: 2
```
So `/sport/bandi` is a folder tree containing real `Bando` objects, per-bando subfolders indexed
as `"Bando Folder Deepening"` (e.g. each bando's own `documenti`/`esiti`/`comunicazioni`
subfolders), stray `Link`/`LinkNormativa` items (e.g. links to external delibera-lookup tools),
and plain `Document`/`File` items — confirming that, exactly as with sociale, **filtering by
`portal_type=Bando` is required** to get only real grants.

Filtered, using the exact same metadata-field list already used in production for sociale:
```
GET https://www.regione.emilia-romagna.it/sport/bandi/@search?portal_type=Bando&metadata_fields=scadenza_bando&metadata_fields=destinatari&metadata_fields=materie&metadata_fields=bando_state&metadata_fields=tipologia_bando&b_size=100
```
→ `200`, `items_total: 11`, all 11 objects have every one of those 5 fields populated (non-empty),
e.g. the first item:
```json
{
  "@id": "https://www.regione.emilia-romagna.it/sport/bandi/2026/contributi-per-progetti-sportivi-biennali-2026-2027",
  "@type": "Bando",
  "bando_state": ["scheduled", "Programmato"],
  "destinatari": ["Enti del Terzo settore", "Scuole", "Enti pubblici"],
  "materie": ["Sport"],
  "scadenza_bando": "2026-10-02T13:00:00+00:00",
  "tipologia_bando": "Agevolazioni, finanziamenti, contributi",
  "title": "Avviso per la concessione di contributi per progetti sportivi biennali 2026-2027"
}
```
This is **the identical field schema** used by `parseErSociale` (`scraper/src/pipeline/er-sociale.ts:124-159`) — same field *names*, same shapes (`destinatari`/`materie` as string arrays in the
listing metadata view). One schema difference worth flagging: `destinatari` values here include
`"Scuole"`, `"Università"`, `"Enti di formazione"` — tokens that **do not appear** in sociale's
`DESTINATARI_TYPES` transcoding table (`er-sociale.ts:45-49`, which only maps `"enti del terzo
settore"`, `"enti pubblici"`, `"partenariato pubblico/privato"`). Those three would currently fall
through to "no match" (empty contribution to `eligibleTypes`), same as sociale's own unmapped
`"Cittadini"`/`"Soggetti accreditati"` — not a bug, just something to decide/extend when wiring
this source (schools/universities/training bodies aren't third-sector entity types in
`LEGAL_TYPES` either, so "no mapping" may be the correct behavior, consistent with the "no invented
restriction" principle already in place).

`materie` is `["Sport"]` on every single one of the 11 items — a blanket single-value tag, exactly
analogous to sociale's `"Diritti e sociale"` → `welfare` blanket tag and to `sportesalute`'s
always-on `"sport"` tag.

`bando_state` tokens observed: `["scheduled", "Programmato"]`, `["closed", "Chiuso"]`,
`["inProgress", "In corso"]` — the first two match sociale's existing `statusFrom()` mapping
(`er-sociale.ts:114-120`) exactly; `"scheduled"`/`"Programmato"` is a **new third token not
currently handled** by `statusFrom()` (which only recognizes `"closed"` and
`"inProgress"/"open"`, defaulting to `null` for anything else). On the one live "scheduled" item
today (deadline 2026-10-02, in the future), `statusFrom()` would currently return `null` (deadline
not past, token not recognized) rather than `"aperto"` — worth an explicit `"scheduled"` branch if
this source is wired up, since `null` under-represents a bando that display logic elsewhere may
want to show as forthcoming/open.

## 3. How many bandi does it list currently?

Filtered `@search` (portal_type=Bando, same 5 metadata fields, `b_size=100`) → **11 items total**,
no pagination needed (`items_total: 11 < b_size: 100`). Full list, with today (2026-07-20) used to
judge past/future:

| Title | Deadline (`scadenza_bando`) | `bando_state` | Past deadline? |
|---|---|---|---|
| Avviso per la concessione di contributi per progetti sportivi biennali 2026-2027 | 2026-10-02 | scheduled/Programmato | **No — open** |
| Avviso ... eventi sportivi ... Anno 2024 | 2024-07-17 | closed/Chiuso | Yes |
| Concessione di contributi per progetti biennali (2023) | 2023-07-14 | closed/Chiuso | Yes |
| Concessione di contributi per eventi ... (2023) | 2023-07-14 | closed/Chiuso | Yes |
| Avviso ... contrasto all'abbandono sportivo giovanile (2024) | 2024-09-17 | inProgress/In corso | Yes (deadline past despite "in corso" state) |
| Avviso ... eventi sportivi ... Anno 2025 | 2025-07-31 | closed/Chiuso | Yes |
| Avviso ... attività motoria e sportiva ... Biennio 2025-2026 | 2025-09-30 | closed/Chiuso | Yes |
| Avviso ... iniziative di contrasto all'abbandono sportivo (2025) | 2025-07-31 | closed/Chiuso | Yes |
| Avviso ... eventi sportivi ... Anno 2026 | 2026-04-30 | inProgress/In corso | Yes (deadline past despite "in corso" state) |
| Avviso ... attività motoria e sportiva ... Biennio 2024-2025 | 2024-07-17 | closed/Chiuso | Yes |
| Avviso ... contrasto abbandono sportivo giovanile (2026) | 2026-06-12 | inProgress/In corso | Yes (deadline past despite "in corso" state) |

Applying the exact production date-range query pattern (`scadenza_bando.query=2026-07-20&scadenza_bando.range=min`, same as sociale's `listUrl`):
```
GET https://www.regione.emilia-romagna.it/sport/bandi/@search?portal_type=Bando&metadata_fields=scadenza_bando&metadata_fields=destinatari&metadata_fields=materie&metadata_fields=bando_state&metadata_fields=tipologia_bando&scadenza_bando.query=2026-07-20&scadenza_bando.range=min&b_size=100
```
→ `items_total: 1` — exactly the one genuinely-open bando ("contributi-per-progetti-sportivi-biennali-2026-2027", deadline 2026-10-02). This confirms the same server-side date filter
that sociale's production `listUrl` relies on works identically here, and matches the "only-open-grants policy" (ADR-011) already adopted elsewhere in this project: at this exact date, this source currently contributes **1 open grant** (the pool refreshes as the biennio/annual cycles roll — 11 historical bandi over 2023-2026 suggests roughly 3-4 new bandi/year).

## 4. Detail page structure

Fetched 3 real bando URLs with `Accept: application/json`, all `200`, all returning clean JSON
(not HTML) — same content-negotiation behavior as the listing:

```
https://www.regione.emilia-romagna.it/sport/bandi/2026/contributi-per-progetti-sportivi-biennali-2026-2027
https://www.regione.emilia-romagna.it/sport/bandi/2026/bando-2026
https://www.regione.emilia-romagna.it/sport/bandi/2025/avviso-per-la-concessione-di-contributi-per-progetti-di-attivita-motoria-e-sportiva-25-26
```

Full key set of the first (`@type: "Bando"`):
```
@components, @id, @type, UID, allow_discussion, apertura_bando, approfondimento,
area_responsabile, bando_state, changeNote, chiusura_procedimento_bando, cig, contributors,
created, creators, description, design_italia_meta_type, destinatari, effective, ente_bando,
exclude_from_nav, exclude_from_search, expires, finanziato, id, is_folderish, items, items_total,
language, layout, lock, materie, modified, next_item, opengraph_description, opengraph_image,
opengraph_title, parent, preview_caption, preview_image, previous_item, relatedItems,
review_state, riferimenti, riferimenti_bando, rights, scadenza_bando, scadenza_domande_bando,
seo_canonical_url, seo_description, seo_noindex, seo_title, subjects, text, text_extended,
tipologia_bando, title, type_title, ufficio_responsabile, update_note, version,
versioning_enabled, working_copy, working_copy_of
```

This is the **same `Bando` content-type schema** `parseDetailErSociale` already maps
(`apertura_bando`, `chiusura_procedimento_bando`, `riferimenti`, `text`, `approfondimento`,
`destinatari`, `materie`, `scadenza_bando`, `bando_state`, `tipologia_bando` all present with the
same shapes: e.g. `destinatari`/`materie` come back as `[{title, token}]` objects in the full
detail view exactly as documented, vs. plain strings in the `@search` metadata view — the
existing `tokens()` helper in `er-sociale.ts:26-31` already normalizes both).

`text` and `riferimenti`/`riferimenti_bando` are Volto Slate blocks (`{blocks: {...}, blocks_layout:
{items: [...]}}`), same structure `slateText()` (`er-sociale.ts:188-216`) already parses — 88 of 89
sampled blocks across the 3 fetched documents were `@type: "slate"` (headings/paragraphs/lists,
handled today). **One new block type observed**: `callout_block` (an info-box UI component),
e.g.:
```json
{
  "@type": "callout_block",
  "icon": "it-info-circle",
  "style": "base",
  "text": [{"type": "p", "children": [{"text": "Chi ha già presentato domanda sui precedenti
    bandi regionali sportivi per l'anno 2026 è escluso dal bando, anche se la domanda precedente
    è stata rifiutata."}]}]
}
```
`slateText()` keys off `block.plaintext` (line 198: `const plaintext = (block?.plaintext ??
"").trim(); if (!plaintext) continue;`) — `callout_block` has no top-level `plaintext` field (its
text lives nested under `.text`, not `.value`), so **this block is currently silently dropped**.
Only 1 occurrence in 89 sampled blocks, but it carried a real eligibility rule — worth teaching
`slateText()` to also read `callout_block.text` if this source is added, for content fidelity.

`approfondimento` (attachments) matches `attachmentsFrom()` exactly (`er-sociale.ts:220-233`) —
array of sections each with a `children` array of `{title, url, mime_type}`, e.g.:
```json
[{"title": "Documenti", "children": [{"title": "Delibera 1189/2026", "url": "http://...",
  "mime_type": "text/plain"}]}]
```
Sections observed across the 3 samples: `"Documenti"`, `"Esiti"`, `"Comunicazioni"` — same
pattern as sociale's `approfondimento` sections; `attachmentsFrom()` needs zero changes.

Economics note: only 1 of the 3 sampled bodies mentions a euro figure at all in the Slate text
(`"Il bando finanzia fino a 15.000€ progetti di attività motoria e sportiva..."` — a per-project
cap phrased with "fino a", not a total). None of sociale's anchor phrases
(`ammontano|complessivamente|somma complessiva|messe a bando|a disposizione|destinate` —
`TOTAL_SIGNAL_RE`, `er-sociale.ts:100`) appear in any of the 3 sampled texts, so
`extractTotalFromProse` would return `null` for all 3 and fall through to the shared
`escalateEconomicsToLLM` call every time for this source — not a bug (that's the documented
last-resort safety valve), but it means amount resolution here will lean on the LLM escalation
path far more than it does for sociale, where the deterministic anchors mostly work.

## 5. Overlap check with "Bandi Sociale"

```
GET https://sociale.regione.emilia-romagna.it/leggi-atti-bandi/bandi/@search?portal_type=Bando&SearchableText=sport&b_size=50
```
→ `200`, `items_total: 0` — zero sociale bandi match the keyword "sport".

Cross-checked further by pulling sociale's **full** current Bando list (25 items,
`GET .../bandi/@search?portal_type=Bando&b_size=100`, `items_total: 25`) and comparing titles by
eye against the 11 sport bandi titles from §3: no title or URL overlap. Sociale's list is entirely
welfare/terzo-settore subject matter (povertà, adolescenti, sovraindebitamento, servizio civile,
co-progettazione, reti associative) — a genuinely distinct funding domain from sport contributi.

**Conclusion**: this is a distinct, non-overlapping source. No dedup rule (unlike the
sportesalute/sport-governo aggregator precedent) is needed here.

## 6. Which archetype fits

**Reuse `er-sociale`'s architecture as a new source config (new `scrape_config` row: same
`archetype: "er-sociale"`, `fetchMode: "direct"`, a new `listUrl` pointed at
`https://www.regione.emilia-romagna.it/sport/bandi/@search?portal_type=Bando&metadata_fields=...`), not a new archetype** — the evidence supports this directly:

- Same CMS (Plone 6/Volto), same REST API shape (§1).
- Same `portal_type=Bando` content type, same metadata field names in the listing view (§2).
- Same detail JSON schema, including the exact same Slate block structure for rich text and the
  exact same `approfondimento` attachment structure (§4) — `parseErSociale`, `attachmentsFrom()`,
  `tokens()`, `isoDay()`, and `slateText()`'s core structure would all work unmodified.
- No overlap with the existing sociale source, so no dedup/attribution logic is needed either
  (§5).

That said, three concrete, source-specific deltas would need addressing to be a fully faithful
mapping (none require a new archetype file, all are small extensions to the existing
`er-sociale.ts` module or its config):

1. **`DESTINATARI_TYPES` table** (`er-sociale.ts:45-49`) has no entries for `"Scuole"`,
   `"Università"`, `"Enti di formazione"` — tokens this source actually emits. Decide whether
   these map to anything in `LEGAL_TYPES` or are deliberately left unmapped (likely the latter —
   schools/universities aren't third-sector entity types).
2. **`statusFrom()`** (`er-sociale.ts:114-120`) doesn't recognize the `"scheduled"`/`"Programmato"`
   `bando_state` token this source uses (sociale apparently never emits it) — currently falls
   through to `null` even when the deadline is in the future; a small addition
   (`"scheduled"` → `"aperto"` when deadline is future) would make the one currently-open bando
   register correctly instead of as `status: null`.
3. **`slateText()`** (`er-sociale.ts:188-216`) drops `callout_block` nodes (no top-level
   `plaintext`) — seen once across 89 sampled blocks, containing a real eligibility rule. Worth a
   branch reading `callout_block.text` the same way `value` is read for `slate` blocks, if full
   requirements-text fidelity matters for this source.
4. (Not a code change, just a heads-up) Amount extraction will rely on the LLM escalation path
   (`escalateEconomicsToLLM`) far more often here than for sociale, since none of sociale's tuned
   `TOTAL_SIGNAL_RE` anchor phrases showed up in the 3 sampled bando bodies.

None of these rise to "needs a new archetype" — they're the same order of magnitude as the
differences already handled between `er-sociale` and `sport-governo` (different vocab tables,
different edge-case tokens) while staying on one shared parsing engine. A new source row
(`grant_sources`) reusing `archetype: "er-sociale"` with a new `listUrl` for
`www.regione.emilia-romagna.it/sport/bandi` is the right shape, with the above three deltas folded
into `er-sociale.ts` as small, targeted additions (guarded so they don't change sociale's existing
behavior).
