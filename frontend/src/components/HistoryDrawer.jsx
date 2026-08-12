// components/HistoryDrawer.jsx
import { X, Clock } from 'lucide-react';

export function HistoryDrawer({ unit, history, onClose }) {
  if (!unit) return null;
  const cleanName = unit.replace(/^custom-|\.timer$/g, '');

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} color="#3b82f6" />
            <h3>History — {cleanName}</h3>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          {history.length === 0 ? (
            <p className="empty-state" style={{ padding: '2rem 0' }}>No history found for this timer.</p>
          ) : (
            <ul className="history-list">
              {history.map((line, i) => (
                <li key={i} className="history-item">
                  <code>{line}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
