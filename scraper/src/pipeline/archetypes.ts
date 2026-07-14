// scraper/src/pipeline/archetypes.ts
import type { Archetype } from "./types";
import type { JsonSchema } from "../providers/types";
import { sanitizeHtml } from "./sanitize-html";
import { FULL_ARCHETYPE } from "./extract-grants";

// Archetype "listing-light" (B): the listing page has only a title + link per grant, so extraction
// there is deliberately minimal (title, url, deadline). Everything else — amount, requirements,
// beneficiaries, ... — is left to the detail phase, which runs the same run for new grants (their
// detail_fetched_at is null). A smaller schema is faster and gives the model less room to
// hallucinate or bleed fields from an adjacent grant.
const LISTING_LIGHT_SCHEMA: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      url: { type: "string" },
      deadline: { type: "string", nullable: true },
    },
    required: ["title", "url"],
  },
};

const LISTING_LIGHT_INSTRUCTIONS = [
  "Sei un assistente che raccoglie i link ai bandi da una pagina elenco italiana.",
  "Restituisci un array JSON: per ogni bando estrai SOLO titolo, url (l'href del link al bando) e la deadline se chiaramente visibile.",
  "NON estrarre altri dettagli (importo, requisiti, ecc.): verranno letti dalla pagina di dettaglio del singolo bando.",
  "IMPORTANTE: copia gli URL esattamente come appaiono negli href, senza tradurre o modificare nessuna parola.",
  "Se un elemento non ha un titolo chiaro o un link href, NON estrarlo.",
].join(" ");

const LISTING_LIGHT_ARCHETYPE: Archetype = {
  name: "listing-light",
  sanitize: sanitizeHtml,
  chunkSize: FULL_ARCHETYPE.chunkSize,
  overlap: FULL_ARCHETYPE.overlap,
  boundaryTags: FULL_ARCHETYPE.boundaryTags,
  urlSnapping: true,
  listing: { schema: LISTING_LIGHT_SCHEMA, instructions: LISTING_LIGHT_INSTRUCTIONS },
  detailRequired: true,
};

// The registry. Add a new archetype here (and give it a scrape_config.archetype key) rather than
// forking the orchestrator. The key lives in the DB; the strategy lives in code (like AI_PROVIDER).
export const ARCHETYPES: Record<string, Archetype> = {
  [FULL_ARCHETYPE.name]: FULL_ARCHETYPE,
  [LISTING_LIGHT_ARCHETYPE.name]: LISTING_LIGHT_ARCHETYPE,
};

export const DEFAULT_ARCHETYPE = FULL_ARCHETYPE;

// Resolves a scrape_config.archetype key to its strategy. Unknown/missing keys fall back to the
// default ("full") so a typo or an un-migrated source degrades to today's behavior, never crashes.
export function resolveArchetype(key: string | undefined): Archetype {
  if (key && key in ARCHETYPES) return ARCHETYPES[key]!;
  if (key) console.warn(`[archetypes] unknown archetype "${key}", falling back to "${DEFAULT_ARCHETYPE.name}"`);
  return DEFAULT_ARCHETYPE;
}
