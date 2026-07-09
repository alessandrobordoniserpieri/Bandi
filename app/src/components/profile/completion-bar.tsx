export function CompletionBar({ percent }: { percent: number }) {
  return (
    <div className="completion-bar">
      <span className="completion-bar-label">Completamento profilo: <strong>{percent}%</strong></span>
      <progress value={percent} max={100}>{percent}%</progress>
    </div>
  );
}
