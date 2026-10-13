import { formatDateShort, todayISO } from '../domain/rules';

export function DateChips({
  dates,
  value,
  onChange,
}: {
  dates: string[];
  value: string;
  onChange: (date: string) => void;
}) {
  const today = todayISO();
  return (
    <div className="date-chips" role="tablist" aria-label="開催日">
      {dates.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          aria-selected={d === value}
          className="date-chip"
          onClick={() => onChange(d)}
        >
          {formatDateShort(d)}
          {d === today && <span className="date-chip__today">今日</span>}
        </button>
      ))}
    </div>
  );
}

/** 開催日の中から初期表示する日を選ぶ（今日があれば今日、なければ最初の日）。 */
export function pickDefaultDate(dates: string[]): string {
  const today = todayISO();
  return dates.includes(today) ? today : (dates[0] ?? today);
}
