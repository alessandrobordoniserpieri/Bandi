// app/src/components/grants/document-checklist.tsx
export function DocumentChecklist({ missing }: { missing: string[] }) {
  if (missing.length === 0) return <p>Hai tutti i documenti richiesti.</p>;
  return (
    <div>
      <p>Per candidarti ti manca:</p>
      <ul>{missing.map((d) => <li key={d}>{d}</li>)}</ul>
    </div>
  );
}
