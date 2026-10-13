import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export interface ConfirmOptions {
  title: string;
  /** 何が起きるかの説明。改行で段落を分けられる */
  body?: string;
  /** 実行するボタンの文言（例：削除する） */
  confirmLabel: string;
  /** danger：消える・戻せない操作、warn：定員超過など注意が要る操作 */
  tone?: 'default' | 'warn' | 'danger';
}

type Ask = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ask>(() => Promise.resolve(false));

const TONE_ICON = { default: 'help', warn: 'warning', danger: 'delete_forever' } as const;
const TONE_BUTTON = { default: 'btn--primary', warn: 'btn--warn', danger: 'btn--danger' } as const;

/** 削除や変更の前に、操作者に確かめるダイアログ。useConfirm() で呼び出す。 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(ok: boolean) => void>();

  const ask = useCallback<Ask>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = undefined;
    setOptions(null);
  }, []);

  // 開いている間のキー操作は、下のシートやテンキーに届かないようにする
  useEffect(() => {
    if (!options) return;
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') answer(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [options, answer]);

  const tone = options?.tone ?? 'default';

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {options && (
        <div className="confirm-backdrop" onClick={() => answer(false)}>
          <div
            className={`confirm confirm--${tone}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={options.body ? 'confirm-body' : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name={TONE_ICON[tone]} filled className="confirm__icon" />
            <h2 id="confirm-title" className="confirm__title">
              {options.title}
            </h2>
            {options.body && (
              <p id="confirm-body" className="confirm__body">
                {options.body}
              </p>
            )}
            <div className="confirm__actions">
              <button type="button" className="btn btn--ghost" onClick={() => answer(false)} autoFocus>
                やめる
              </button>
              <button type="button" className={`btn ${TONE_BUTTON[tone]}`} onClick={() => answer(true)}>
                {options.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}
