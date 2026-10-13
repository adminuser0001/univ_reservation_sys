interface IconProps {
  name: string;
  filled?: boolean;
  className?: string;
}

/** Google Material Symbols (Rounded) */
export function Icon({ name, filled, className }: IconProps) {
  return (
    <span className={`ms${filled ? ' ms--filled' : ''}${className ? ` ${className}` : ''}`} aria-hidden="true">
      {name}
    </span>
  );
}
