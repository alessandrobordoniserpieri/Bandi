// DEC-2: makes the working-set usage visible at the top of "I miei bandi", so the user sees the
// limit before hitting it. `limit` is a documented placeholder until DEC-6 wires the plan-based cap.
export function SlotCounter({ count, limit }: { count: number; limit: number }) {
  return (
    <p className="slot-counter">
      <strong className="slot-counter-value">{count}</strong>
      <span className="slot-counter-total"> / {limit}</span> bandi salvati
    </p>
  );
}
