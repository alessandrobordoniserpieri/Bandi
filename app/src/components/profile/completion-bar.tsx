// app/src/components/profile/completion-bar.tsx
export function CompletionBar({ percent }: { percent: number }) {
  return (
    <div>
      <div>Completamento profilo: <strong>{percent}%</strong></div>
      <progress value={percent} max={100}>{percent}%</progress>
    </div>
  );
}
