"use client";

import { useEffect, useRef, useState } from "react";
import { Prose } from "./prose";

// Requirements text can run to thousands of characters (REQUIREMENTS_MAX_CHARS = 20k in the
// scraper) — collapse tall sections behind a "Vedi di più" toggle instead of dumping everything
// on the page. Measured via scrollHeight (not a character-count guess) because structured content
// (headings + lists) takes more vertical space per character than plain paragraphs.
const COLLAPSED_HEIGHT_PX = 320;

export function ExpandableProse({ text }: { text: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > COLLAPSED_HEIGHT_PX + 8);
  }, [text]);

  const collapsed = overflows && !expanded;

  return (
    <div className="detail-prose-wrap" data-collapsed={collapsed}>
      <div
        ref={contentRef}
        className="detail-prose-clamp"
        style={collapsed ? { maxHeight: COLLAPSED_HEIGHT_PX } : undefined}
      >
        <Prose text={text} />
      </div>
      {overflows && (
        <button type="button" className="detail-prose-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Vedi meno" : "Vedi di più"}
        </button>
      )}
    </div>
  );
}
