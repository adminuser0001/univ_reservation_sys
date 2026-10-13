import { Icon } from './Icon';

interface Props {
  icon: string;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, body, action }: Props) {
  return (
    <div className="empty">
      <Icon name={icon} className="empty__icon" />
      <p className="empty__title">{title}</p>
      <p className="empty__body">{body}</p>
      {action && (
        <button type="button" className="btn btn--primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
