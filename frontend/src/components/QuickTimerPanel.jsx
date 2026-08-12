// components/QuickTimerPanel.jsx
import { useState, useEffect } from 'react';
import { Zap, X, Clock } from 'lucide-react';
import { useQuickTimers } from '../hooks/useQuickTimers';

const PRESETS = [5, 10, 15, 25, 60];

function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function QuickTimerPanel({ onToast }) {
  const [now, setNow] = useState(Date.now());
  const [minutes, setMinutes] = useState('25');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);

  const handleExpire = (timer) => {
    if (Notification.permission === 'granted') {
      new Notification('⏰ Chronos', { body: timer.message || 'Timer done!', icon: '/favicon.ico' });
    }
    onToast?.(`Timer "${timer.message || `${timer.minutes}min`}" finished!`, 'success', 6000);
  };

  const { timers, addTimer, cancelTimer } = useQuickTimers(handleExpire);

  useEffect(() => {
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  }, []);

  function handleSubmit(e) {
    e.preventDefault();
    const mins = parseInt(minutes, 10);
    if (!mins || mins <= 0) return;
    setIsSubmitting(true);
    addTimer(message || `${mins}-minute timer`, mins);
    setMessage('');
    setIsSubmitting(false);
  }

  function handlePreset(mins) {
    addTimer(`${mins}-minute timer`, mins);
  }

  return (
    <div>
      <div className="timer-card form-card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-card-header">
          <h3><Zap size={18} /> Quick Countdown</h3>
        </div>

        {/* Preset buttons */}
        <div className="preset-row">
          {PRESETS.map(p => (
            <button
              key={p}
              type="button"
              className="btn btn-ghost btn-sm preset-btn"
              onClick={() => handlePreset(p)}
            >
              {p}m
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '0 0 100px', marginBottom: 0 }}>
            <label className="form-label" htmlFor="quick-minutes">Minutes</label>
            <input
              id="quick-minutes"
              type="number" className="form-input"
              value={minutes} onChange={e => setMinutes(e.target.value)}
              min="1" max="600" required
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '160px', marginBottom: 0 }}>
            <label className="form-label" htmlFor="quick-message">Label (optional)</label>
            <input
              id="quick-message"
              type="text" className="form-input"
              placeholder="What are you timing?"
              value={message} onChange={e => setMessage(e.target.value)}
            />
          </div>
          <button
            id="quick-start-btn"
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
            style={{ flexShrink: 0 }}
          >
            Start Timer
          </button>
        </form>
      </div>

      <div className="timers-grid">
        {timers.map(timer => {
          const remaining = timer.endTime - now;
          const pct = Math.max(0, Math.min(100, (remaining / (timer.minutes * 60000)) * 100));
          return (
            <div key={timer.id} className="timer-card quick-timer-card">
              <div className="timer-header">
                <div className="timer-title">{timer.message}</div>
                <Clock size={18} color="#10b981" />
              </div>
              <div className="quick-timer-display">
                {formatRemaining(remaining)}
              </div>
              <div className="timer-progress-track">
                <div className="timer-progress-bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="timer-actions" style={{ marginTop: '0.75rem' }}>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => cancelTimer(timer.id)}
                >
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          );
        })}
        {timers.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            <Zap size={32} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
            <p>No active countdowns</p>
            <p style={{ fontSize: '0.85rem' }}>Use the presets or enter minutes above to start one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
