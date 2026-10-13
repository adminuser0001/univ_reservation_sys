import { Icon } from './Icon';

export type Tab = 'issue' | 'list' | 'log' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'issue', label: '予約', icon: 'confirmation_number' },
  { id: 'list', label: '一覧', icon: 'list_alt' },
  { id: 'log', label: '履歴', icon: 'history' },
  { id: 'settings', label: '設定', icon: 'tune' },
];

export function BottomNav({ current, onChange }: { current: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav className="bottom-nav" aria-label="画面切り替え">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="bottom-nav__item"
          aria-current={current === t.id ? 'page' : undefined}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} filled={current === t.id} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
