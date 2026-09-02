interface Props {
  text: string;
  error?: boolean;
  spinner?: boolean;
}

export function StatusBanner({ text, error, spinner }: Props) {
  return (
    <div className={`status-banner${error ? " error" : ""}`}>
      {spinner && <div className="spinner" />}
      <span>{text}</span>
    </div>
  );
}

export function EmptyState({ emoji = "🍽️", title, sub }: { emoji?: string; title: string; sub?: string }) {
  return (
    <div className="empty-state">
      <span className="emoji">{emoji}</span>
      <div className="title">{title}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
