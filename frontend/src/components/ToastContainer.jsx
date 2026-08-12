// components/ToastContainer.jsx
import { CheckCircle, XCircle, X } from 'lucide-react';

export function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          <span>{t.message}</span>
          <button
            className="toast-close"
            onClick={() => onRemove(t.id)}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
