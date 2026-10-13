import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import { DateChips } from '../components/DateChips';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { SeatMeter } from '../components/SeatMeter';
import { useRepository } from '../data/RepositoryProvider';
import { remainingSeats } from '../domain/rules';
import type { Config, Product, Slot } from '../domain/types';
import { useWatch } from '../hooks/useWatch';
import { ReservationSheet } from './ReservationSheet';

/** 時間割に同時に並べる体験の数。これを超えたら組に分けて切り替える。 */
const MAX_COLUMNS = 3;

interface Props {
  config: Config;
  products: Product[];
  date: string;
  onDateChange: (date: string) => void;
  onGoSettings: () => void;
}

type SlotState = 'open' | 'full' | 'over' | 'closed';

function slotState(slot: Slot, limit: boolean): SlotState {
  if (!slot.isOpen) return 'closed';
  const left = remainingSeats(slot);
  if (left < 0) return 'over';
  if (left === 0) return limit ? 'full' : 'over';
  return 'open';
}

function statusText(slot: Slot, state: SlotState): string {
  const left = remainingSeats(slot);
  if (state === 'closed') return '停止中';
  if (state === 'full') return '満員';
  if (state === 'over') return left < 0 ? `定員超過 +${-left}` : '定員超過';
  return `残り${left}人`;
}

/** 左に時刻、体験を列に並べた時間割。枠を押すと予約フォームが開く。 */
export function IssuePage({ config, products, date, onDateChange, onGoSettings }: Props) {
  const repo = useRepository();
  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products]);
  const [page, setPage] = useState(0);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const slots = useWatch<Slot[]>((l) => repo.watchSlots(date, l), [repo, date]);

  const pages = useMemo(() => {
    const chunks: Product[][] = [];
    for (let i = 0; i < activeProducts.length; i += MAX_COLUMNS) chunks.push(activeProducts.slice(i, i + MAX_COLUMNS));
    return chunks;
  }, [activeProducts]);
  const columns = pages[Math.min(page, pages.length - 1)] ?? [];

  const { times, slotsAt } = useMemo(() => {
    const shown = new Set(columns.map((p) => p.id));
    const map = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      if (!shown.has(s.productId)) continue;
      const key = `${s.productId}|${s.startTime}`;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    const starts = [...new Set((slots ?? []).filter((s) => shown.has(s.productId)).map((s) => s.startTime))].sort();
    return { times: starts, slotsAt: map };
  }, [slots, columns]);

  const selectedSlot = slots?.find((s) => s.id === selectedSlotId);

  if (config.eventDates.length === 0 || activeProducts.length === 0) {
    return (
      <EmptyState
        icon="event_note"
        title="受付の準備がまだです"
        body="設定で開催日・体験・時間枠を作ると、ここから予約を登録できます。"
        action={{ label: '設定を開く', onClick: onGoSettings }}
      />
    );
  }

  return (
    <div className="page">
      <DateChips dates={config.eventDates} value={date} onChange={onDateChange} />

      {pages.length > 1 && (
        <div
          className="segmented"
          role="tablist"
          aria-label="表示する体験"
          style={{ gridTemplateColumns: `repeat(${pages.length}, minmax(0, 1fr))` }}
        >
          {pages.map((group, i) => (
            <button
              key={group[0].id}
              type="button"
              role="tab"
              aria-selected={group === columns}
              className="segmented__item"
              onClick={() => setPage(i)}
            >
              {group.map((p) => p.name).join('・')}
            </button>
          ))}
        </div>
      )}

      {slots && times.length === 0 && (
        <EmptyState
          icon="schedule"
          title="この日の時間枠はありません"
          body="設定の「時間枠を作る」から追加してください。"
          action={{ label: '設定を開く', onClick: onGoSettings }}
        />
      )}

      {times.length > 0 && (
        <div className="timetable" style={{ '--columns': columns.length } as CSSProperties}>
          <div className="timetable__corner" />
          {columns.map((p) => (
            <div key={p.id} className="timetable__head" style={{ '--product': p.color } as CSSProperties}>
              <span className="product-tab__swatch" />
              <span className="product-tab__name">{p.name}</span>
            </div>
          ))}

          {times.map((time) => (
            <Fragment key={time}>
              <div className="timetable__time">{time}</div>
              {columns.map((p) => (
                <div key={p.id} className="timetable__cell" style={{ '--product': p.color } as CSSProperties}>
                  {(slotsAt.get(`${p.id}|${time}`) ?? []).map((slot) => {
                    const state = slotState(slot, config.capacityLimitEnabled);
                    const status = statusText(slot, state);
                    const left = remainingSeats(slot);
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        className={`tt-slot tt-slot--${state}`}
                        // 満員の枠も、特例で登録できるように開ける
                        disabled={state === 'closed'}
                        aria-label={`${p.name} ${slot.startTime}〜${slot.endTime} ${status}`}
                        onClick={() => setSelectedSlotId(slot.id)}
                      >
                        <SeatMeter slot={slot} />
                        <span className="tt-slot__status">
                          {state === 'closed' && <Icon name="block" />}
                          {state === 'open' ? (
                            <>
                              残り<b>{left}</b>人
                            </>
                          ) : (
                            status
                          )}
                        </span>
                        <small className="tt-slot__end">〜{slot.endTime}</small>
                      </button>
                    );
                  })}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      )}

      {!config.capacityLimitEnabled && (
        <p className="page-note">
          <Icon name="info" /> 定員制御はオフです。満員の枠にも確認なしで登録できます。
        </p>
      )}

      {selectedSlot && (
        <ReservationSheet
          config={config}
          products={products}
          slot={selectedSlot}
          onClose={() => setSelectedSlotId(null)}
        />
      )}
    </div>
  );
}
