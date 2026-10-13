import { useEffect, useState } from 'react';
import { BottomNav, type Tab } from './components/BottomNav';
import { ConfirmProvider } from './components/Confirm';
import { pickDefaultDate } from './components/DateChips';
import { Icon } from './components/Icon';
import { ToastProvider } from './components/Toast';
import { VersionFooter } from './components/VersionFooter';
import { RepositoryProvider, useRepository } from './data/RepositoryProvider';
import type { Config, Product } from './domain/types';
import { useWatch } from './hooks/useWatch';
import { IssuePage } from './pages/IssuePage';
import { LogPage } from './pages/LogPage';
import { ReservationsPage } from './pages/ReservationsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <RepositoryProvider>
          <Shell />
        </RepositoryProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Shell() {
  const repo = useRepository();
  const config = useWatch<Config>((l) => repo.watchConfig(l), [repo]);
  const products = useWatch<Product[]>((l) => repo.watchProducts(l), [repo]);
  const [tab, setTab] = useState<Tab>('issue');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (config && !config.eventDates.includes(date)) setDate(pickDefaultDate(config.eventDates));
  }, [config, date]);

  const changeTab = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="shell">
      <header className="app-header">
        <div className="app-header__title">
          <Icon name="confirmation_number" filled className="app-header__mark" />
          <span>{config?.eventName ?? '予約受付'}</span>
        </div>
        <span className="mode-badge" title="データはこの端末にだけ保存されます">
          <Icon name="cloud_off" />
          この端末のみ
        </span>
      </header>

      <main className="app-main">
        {config && products ? (
          <>
            {tab === 'issue' && (
              <IssuePage
                config={config}
                products={products}
                date={date}
                onDateChange={setDate}
                onGoSettings={() => changeTab('settings')}
              />
            )}
            {tab === 'list' && (
              <ReservationsPage config={config} products={products} date={date} onDateChange={setDate} />
            )}
            {tab === 'log' && <LogPage />}
            {tab === 'settings' && (
              <SettingsPage config={config} products={products} date={date} onDateChange={setDate} />
            )}
          </>
        ) : (
          <p className="loading">読み込んでいます…</p>
        )}
        <VersionFooter />
      </main>

      <BottomNav current={tab} onChange={changeTab} />
    </div>
  );
}
