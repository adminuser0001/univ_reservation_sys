import { Icon } from './Icon';

interface Props {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  onChange: (value: number) => void;
}

/** ＋／−で数を決める。キーボードを出さずに人数を入れられる。 */
export function Stepper({ value, min, max, unit, label, onChange }: Props) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="stepper__btn"
        aria-label={`1${unit}減らす`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="remove" />
      </button>
      <output className="stepper__value" aria-live="polite">
        {value}
        <small>{unit}</small>
      </output>
      <button
        type="button"
        className="stepper__btn"
        aria-label={`1${unit}増やす`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="add" />
      </button>
    </div>
  );
}
