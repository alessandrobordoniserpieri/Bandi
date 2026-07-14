export function CompletionBar({ percent }: { percent: number }) {
  return (
    <div className="completion-bar">
      <div className="completion-bar-head">
        <span className="completion-bar-label">Completamento profilo</span>
        <strong className="completion-bar-percent">{percent}%</strong>
      </div>
      <progress value={percent} max={100}>{percent}%</progress>
    </div>
  );
}
