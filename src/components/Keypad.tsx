import { Icon } from './Icon';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

export function Keypad({ onInput, disabled }: { onInput: (key: string) => void; disabled?: boolean }) {
  return (
    <div className="keypad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className={`keypad__key${k.length > 1 ? ' keypad__key--fn' : ''}`}
          onClick={() => onInput(k)}
          disabled={disabled}
          aria-label={k === 'clear' ? 'すべて消す' : k === 'back' ? '1文字消す' : k}
        >
          {k === 'clear' ? '消去' : k === 'back' ? <Icon name="backspace" /> : k}
        </button>
      ))}
    </div>
  );
}
