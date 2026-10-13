import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  title: ReactNode;
  onClose: () => void;
  /** タブレット・PCで横に2列並べる内容のとき、幅を広げる */
  wide?: boolean;
  children: ReactNode;
}

/** 画面下からせり上がるパネル。スマホで片手操作しやすい位置に操作を集める。 */
export function Sheet({ title, onClose, wide, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${wide ? ' sheet--wide' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <div className="sheet__title">{title}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
