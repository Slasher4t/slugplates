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

// Calm, user-facing failure with a way forward - never exposes request URLs,
// HTTP status codes, or scraper/backend implementation details. `text`
// should be a short, plain-language sentence (e.g. "Couldn't load today's
// menu"), not the raw error message from the API client.
export function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="empty-state">
      <span className="emoji">⚠️</span>
      <div className="title">{text}</div>
      <button className="pill-btn secondary" style={{ marginTop: 14 }} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
