// Renders scraped bando body text as real elements instead of a flat wall of paragraphs.
// Some sources (e.g. the er-sociale archetype) encode real source structure — section headings,
// subsection labels, bullet lists — as light-markup line prefixes ("## ", "### ", "- "); sources
// with plain prose simply have no such lines and every line renders as an ordinary paragraph.
import type { ReactNode } from "react";

export function Prose({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const elements: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    elements.push(
      <ul key={elements.length} className="detail-prose-list">
        {list.map((item, i) => <li key={i}>{item}</li>)}
      </ul>,
    );
    list = [];
  };

  for (const line of lines) {
    if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={elements.length} className="detail-prose-subheading">{line.slice(4)}</h4>);
    } else if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={elements.length} className="detail-prose-heading">{line.slice(3)}</h3>);
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else {
      flushList();
      elements.push(<p key={elements.length} className="detail-prose">{line}</p>);
    }
  }
  flushList();

  return <>{elements}</>;
}
