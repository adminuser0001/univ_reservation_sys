import { useMemo, useState, type CSSProperties } from 'react';
import { DateChips } from '../components/DateChips';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { useRepository } from '../data/RepositoryProvider';
import { formatParticipants, normalizeTicketNo, STATUS_LABEL } from '../domain/rules';
import type { Config, Product, Reservation, Slot } from '../domain/types';
import { useWatch } from '../hooks/useWatch';
import { ReservationSheet } from './ReservationSheet';

interface Props {
  config: Config;
  products: Product[];
  date: string;
  onDateChange: (date: string) => void;
}

function matches(r: Reservation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const ticketNo = normalizeTicketNo(q);
  if (ticketNo && r.ticketNo === ticketNo) return true;
  const digits = q.replace(/[^0-9]/g, '');
  if (digits.length >= 4 && r.phone?.replace(/[^0-9]/g, '').includes(digits)) return true;
  return [r.representativeName, ...r.participants.map((p) => p.name)].some((v) => v.toLowerCase().includes(q));
}

export function ReservationsPage({ config, products, date, onDateChange }: Props) {
  const repo = useRepository();
  const slots = useWatch<Slot[]>((l) => repo.watchSlots(date, l), [repo, date]);
  const reservations = useWatch<Reservation[]>((l) => repo.watchReservationsByDate(date, l), [repo, date]);

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Reservation | null>(null);

  const productOf = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const timeline = useMemo(() => {
    const bySlot = new Map<string, Reservation[]>();
    for (const r of reservations ?? []) {
      if (!matches(r, query)) continue;
      const list = bySlot.get(r.slotId) ?? [];
      list.push(r);
      bySlot.set(r.slotId, list);
    }
    const order = new Map(products.map((p, i) => [p.id, i]));
    const groups = (slots ?? [])
      .filter((s) => bySlot.has(s.id))
      .map((s) => ({
        slot: s,
        // 予約中を先に、その中では登録した順に並べる
        list: bySlot
          .get(s.id)!
          .sort((a, b) => Number(a.status === 'cancelled') - Number(b.status === 'cancelled') || a.createdAt - b.createdAt),
      }))
      .sort((a, b) => (order.get(a.slot.productId) ?? 0) - (order.get(b.slot.productId) ?? 0));

    // 時間軸には予約のない時刻も並べる。探しているときは、当てはまる時刻だけに絞る
    const times = [...new Set((slots ?? []).map((s) => s.startTime))].sort();
    return times
      .map((time) => ({ time, groups: groups.filter((g) => g.slot.startTime === time) }))
      .filter((row) => query.trim() === '' || row.groups.length > 0);
  }, [reservations, slots, products, query]);
  const hasMatch = timeline.some((row) => row.groups.length > 0);

  const active = (reservations ?? []).filter((r) => r.status === 'reserved');
  const people = active.reduce((sum, r) => sum + r.partySize, 0);

  return (
    <div className="page">
      {config.eventDates.length > 0 && <DateChips dates={config.eventDates} value={date} onChange={onDateChange} />}

      <div className="search">
        <label htmlFor="reservation-search" className="visually-hidden">
          予約を探す
        </label>
        <Icon name="search" />
        <input
          id="reservation-search"
          type="search"
          autoComplete="off"
          placeholder={config.identifyMode === 'ticket' ? '整理券番号か名前で探す' : '名前か電話番号で探す'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {reservations && reservations.length > 0 && (
        <p className="list-summary">
          この日の予約 <b>{active.length}</b>件・<b>{people}</b>人
        </p>
      )}

      {reservations && reservations.length === 0 && (
        <EmptyState icon="inbox" title="この日の予約はまだありません" body="予約画面で時間枠を選んで登録すると、ここに並びます。" />
      )}

      {reservations && reservations.length > 0 && !hasMatch && (
        <EmptyState
          icon="search_off"
          title="見つかりませんでした"
          body="この日の予約には当てはまるものがありません。日付を変えるか、入力を確かめてください。"
        />
      )}

      {hasMatch && (
        <ol className="timeline">
          {timeline.map(({ time, groups }) => (
            <li key={time} className={`timeline__row${groups.length === 0 ? ' timeline__row--empty' : ''}`}>
              <span className="timeline__time">{time}</span>
              <div className="timeline__body">
                {groups.length === 0 && <span className="timeline__empty">予約なし</span>}
                {groups.map(({ slot, list }) => {
                  const product = productOf.get(slot.productId);
                  return (
                    <section key={slot.id} className="roster__group" style={{ '--product': product?.color } as CSSProperties}>
                      <h3 className="roster__head">
                        <span className="roster__product">{product?.name}</span>
                        <span className={`roster__count${slot.reservedCount > slot.capacity ? ' is-over' : ''}`}>
                          予約 {slot.reservedCount} / 定員 {slot.capacity}人
                        </span>
                      </h3>
                      <ul className="booking-list">
                        {list.map((r) => (
                          <li key={r.id}>
                            <button type="button" className={`booking booking--${r.status}`} onClick={() => setEditing(r)}>
                              {r.ticketNo && <span className="booking__no">{r.ticketNo}</span>}
                              <span className="booking__who">
                                <span className="booking__name">{r.representativeName || '（名前なし）'}</span>
                                <span className="booking__sub">体験：{formatParticipants(r.participants)}</span>
                                {r.memo && (
                                  <span className="booking__sub">
                                    <Icon name="sticky_note_2" /> {r.memo}
                                  </span>
                                )}
                              </span>
                              {r.isException && r.status === 'reserved' && <span className="tag tag--exception">特例</span>}
                              {r.status === 'cancelled' && <span className="tag">{STATUS_LABEL.cancelled}</span>}
                              <span className="booking__size">{r.partySize}人</span>
                              <Icon name="chevron_right" className="booking__go" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}

      {editing && (
        <ReservationSheet
          key={editing.id}
          config={config}
          products={products}
          reservation={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
