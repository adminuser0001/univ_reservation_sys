import type { Slot } from '../domain/types';

/** 定員が少ない枠は席の数だけ点で、多い枠は棒で埋まり具合を示す。 */
export function SeatMeter({ slot }: { slot: Slot }) {
  const { capacity, reservedCount } = slot;
  if (capacity <= 12) {
    return (
      <span className="seat-dots" aria-hidden="true">
        {Array.from({ length: Math.max(capacity, reservedCount) }, (_, i) => (
          <span
            key={i}
            className={`seat-dot${i < reservedCount ? ' is-taken' : ''}${i >= capacity ? ' is-over' : ''}`}
          />
        ))}
      </span>
    );
  }
  const ratio = Math.min(1, reservedCount / capacity);
  return (
    <span className="seat-bar" aria-hidden="true">
      <span className="seat-bar__fill" style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}
