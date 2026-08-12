// components/ConfirmDialog.jsx
import { AlertTriangle, X } from 'lucide-react';

export function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="dialog-overlay" role="dialog" aria-modal="true">
      <div className="dialog-box">
        <div className="dialog-header">
          <AlertTriangle size={22} color="#ef4444" />
          <h3>{title}</h3>
          <button className="dialog-close" onClick={onCancel} aria-label="Close"><X size={18}/></button>
        </div>
        <p className="dialog-message">{message}</p>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
