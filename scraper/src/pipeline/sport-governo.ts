// scraper/src/pipeline/sport-governo.ts
// Archetype "sport-governo": Dipartimento per lo Sport (avvisibandi.sport.governo.it) via direct
// fetch of server-rendered Next.js pages — the listing homepage and each notice's own page both
// embed a <script id="__NEXT_DATA__"> JSON blob with the full data, no headless Chrome needed.
// Design: docs/superpowers/specs/2026-07-17-sport-governo-archetype-design.md

// Strips tags to EMPTY (not a space): real Quill HTML here always carries its own whitespace at
// real word boundaries ("...Giovani,\n    <strong>Andrea Abodi</strong>,..."), but an inline tag
// often closes directly against trailing punctuation with no space at all — injecting one there
// produces "Abodi , e" / "partecipare ." instead of "Abodi, e" / "partecipare." (verified against
// the real Oratori description, which has exactly this "</strong>," pattern).
function innerText(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Quill-authored description HTML (avvisibandi.sport.governo.it): a flat sequence of top-level
// blocks (p/h1-h6/ul/ol, occasionally a bare <b>) separated by blank lines. Regex-based (not a DOM
// parser) — consistent with the rest of the scraper (see stripTags in archetypes.ts) and sufficient
// for the limited, regular tag set actually observed live: p, b, strong, em, u, span, a, h3, ul, li.
export function htmlToLightMarkup(html: string): string {
  const blocks = html.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const block of blocks) {
    const heading = /^<h([1-6])[^>]*>([\s\S]*?)<\/h\1>$/i.exec(block);
    if (heading) {
      const level = Number(heading[1]);
      const text = innerText(heading[2]!);
      if (text) lines.push(`${level <= 2 ? "##" : "###"} ${text}`);
      continue;
    }
    const list = /^<(ul|ol)[^>]*>([\s\S]*?)<\/\1>$/i.exec(block);
    if (list) {
      const items = list[2]!.match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
      for (const item of items) {
        const text = innerText(item.replace(/^<li[^>]*>|<\/li>$/gi, ""));
        if (text) lines.push(`- ${text}`);
      }
      continue;
    }
    const text = innerText(block);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}
