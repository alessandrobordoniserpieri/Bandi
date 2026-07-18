// `known` = whether we actually captured the grant's required documents. Defaults to true so
// existing callers with a real checklist are unaffected; pass known={false} when the checklist is
// empty because we never extracted it (usually it lives only in the bando's PDF), so the UI says
// "consulta il bando" instead of a falsely-reassuring "hai tutti i documenti".
export function DocumentChecklist({ missing, known = true }: { missing: string[]; known?: boolean }) {
  if (!known) {
    return (
      <p>Documenti richiesti non disponibili in scheda: consulta il bando originale e i suoi allegati.</p>
    );
  }
  if (missing.length === 0) return <p>Hai tutti i documenti richiesti.</p>;
  return (
    <div>
      <p>Per candidarti ti manca:</p>
      <ul>{missing.map((d) => <li key={d}>{d}</li>)}</ul>
    </div>
  );
}
