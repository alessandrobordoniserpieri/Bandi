import type { ReactNode } from "react";

const AXIS_LABELS = ["Temi", "Forma", "Territorio", "Capacità", "Documenti", "Storico"];

// Structural mark for the 6-dimension scoring engine (PRODUCT.md: themes, legal
// form, territory, capacity, documents, track record). No invented data/score —
// grid + axes + labels only, to avoid a fake-metric readout.
function ScoringRadarMark() {
  const center = 130;
  const centerY = 115;
  const rings = [23, 46, 70];
  const labelRadius = 78;

  const point = (radius: number, index: number) => {
    const angle = ((-90 + 60 * index) * Math.PI) / 180;
    return [center + radius * Math.cos(angle), centerY + radius * Math.sin(angle)] as const;
  };

  const hexPath = (radius: number) =>
    Array.from({ length: 6 }, (_, i) => point(radius, i))
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ") + " Z";

  const anchorFor = (index: number): "middle" | "start" | "end" => {
    if (index === 0 || index === 3) return "middle";
    return index === 1 || index === 2 ? "start" : "end";
  };

  return (
    <svg className="auth-radar-mark" viewBox="0 0 260 230" fill="none" aria-hidden="true">
      {rings.map((r) => (
        <path key={r} d={hexPath(r)} stroke="oklch(1 0 0 / 0.22)" strokeWidth="1" />
      ))}
      {Array.from({ length: 6 }, (_, i) => {
        const [x, y] = point(rings[2], i);
        return (
          <line key={i} x1={center} y1={centerY} x2={x} y2={y} stroke="oklch(1 0 0 / 0.22)" strokeWidth="1" />
        );
      })}
      {AXIS_LABELS.map((label, i) => {
        const [x, y] = point(labelRadius, i);
        return (
          <text
            key={label}
            x={x}
            y={y}
            textAnchor={anchorFor(i)}
            fontSize="9"
            fontWeight="500"
            letterSpacing="0.02em"
            fill="oklch(1 0 0 / 0.55)"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

export function AuthShell({
  statement,
  children,
}: {
  statement: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand-panel">
        <span className="auth-wordmark">BANDI-SCANNER</span>
        <div className="auth-brand-visual">
          <ScoringRadarMark />
        </div>
        <p className="auth-statement">{statement}</p>
      </aside>
      <main className="auth-form-panel">
        <div className="auth-form-panel-inner">{children}</div>
      </main>
    </div>
  );
}
