import { useMemo } from 'react';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { useRepository } from '../data/RepositoryProvider';
import { LOG_ACTION_LABEL } from '../domain/rules';
import type { LogAction, LogEntry, Reservation } from '../domain/types';
import { useWatch } from '../hooks/useWatch';

const ACTION_ICON: Record<LogAction, string> = {
  create: 'add_circle',
  edit: 'edit',
  cancel: 'event_busy',
  delete: 'delete',
};

export function formatLogTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function LogPage() {
  const repo = useRepository();
  const logs = useWatch<LogEntry[]>((l) => repo.watchLogs(l), [repo]);
  const reservations = useWatch<Reservation[]>((l) => repo.watchReservations(l), [repo]);

  // ログには名前を書かない。予約が残っている間だけ、今の名前を引いて表示する
  const nameOf = useMemo(() => new Map((reservations ?? []).map((r) => [r.id, r.representativeName])), [reservations]);

  if (logs && logs.length === 0) {
    return (
      <EmptyState
        icon="history"
        title="操作の履歴はまだありません"
        body="予約の登録・変更・キャンセル・削除をすると、いつ何をしたかがここに残ります。"
      />
    );
  }

  return (
    <div className="page">
      <p className="panel__hint">
        予約に対する操作を新しい順に並べています。名前や電話番号は履歴に残しません。
      </p>
      <ol className="log-list">
        {(logs ?? []).map((l) => {
          const who = [l.ticketNo && `整理券 ${l.ticketNo}`, nameOf.get(l.reservationId)].filter(Boolean).join(' ');
          return (
            <li key={l.id} className={`log log--${l.action}`}>
              <time className="log__time">{formatLogTime(l.at)}</time>
              <span className="log__action">
                <Icon name={ACTION_ICON[l.action]} /> {LOG_ACTION_LABEL[l.action]}
              </span>
              <p className="log__body">
                {who && <b>{who}</b>}
                {l.summary}
                {l.isException && <span className="tag tag--exception">特例</span>}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
