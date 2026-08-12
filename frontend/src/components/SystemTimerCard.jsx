// components/SystemTimerCard.jsx
import { Bell, Trash2, Pause, Play, History, Tag, Edit2, Activity } from 'lucide-react';
import { categoryColor, formatTimestamp } from '../utils/api';

export function SystemTimerCard({
  timer,
  onDelete,
  onPause,
  onResume,
  onEdit,
  onViewHistory,
  onToggleTracked,
  isPaused,
  isTracked,
}) {
  const catColor = categoryColor(timer.category);
  const customBadge = timer.isCustom;

  return (
    <div className="timer-card" style={{ '--cat-color': catColor }}>
      <div className="timer-card-accent" />

      <div className="timer-header">
        <div>
          <div className="timer-title">{timer.unit.replace(/^custom-|\.timer$/g, '')}</div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
            {timer.category && (
              <span className="category-badge" style={{ background: `${catColor}22`, color: catColor, borderColor: `${catColor}44` }}>
                <Tag size={10} /> {timer.category}
              </span>
            )}
            {isTracked && (
              <span className="category-badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>
                <Activity size={10} /> tracked
              </span>
            )}
            <span className="timer-subtitle">{customBadge ? 'Chronos timer' : 'System timer'}</span>
          </div>
        </div>
        <Bell size={18} color={catColor} />
      </div>

      <div className="timer-next-row">
        <div>
          <div className="timer-next-label">Next trigger</div>
          <div className="timer-next-value">{timer.nextRelative}</div>
          {timer.nextTimestamp && (
            <div className="timer-next-abs">{formatTimestamp(timer.nextTimestamp)}</div>
          )}
        </div>
        {timer.lastTimestamp && (
          <div className="timer-last">
            <div className="timer-next-label">Last ran</div>
            <div className="timer-last-value">{formatTimestamp(timer.lastTimestamp)}</div>
          </div>
        )}
      </div>

      {/* Actions — available for both custom AND non-custom (tracking is useful for movebreak.timer) */}
      <div className="timer-actions">
        {/* Track toggle — any timer can be tracked */}
        <button
          className={`btn btn-sm ${isTracked ? 'btn-success' : 'btn-ghost'}`}
          onClick={() => onToggleTracked?.(timer.unit, !isTracked)}
          title={isTracked ? 'Stop tracking movement breaks' : 'Track as movement break'}
        >
          <Activity size={13} /> {isTracked ? 'Tracked' : 'Track'}
        </button>

        {/* Custom timer controls */}
        {customBadge && (
          <>
            {isPaused ? (
              <button className="btn btn-success btn-sm" onClick={() => onResume(timer.unit)} title="Resume">
                <Play size={14} /> Resume
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => onPause(timer.unit)} title="Pause">
                <Pause size={14} /> Pause
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(timer)} title="Edit">
              <Edit2 size={14} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => onViewHistory(timer.unit)} title="History">
              <History size={14} />
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(timer)} title="Delete">
              <Trash2 size={14} />
            </button>
          </>
        )}

        {/* History for non-custom (e.g. movebreak.timer) */}
        {!customBadge && (
          <button className="btn btn-ghost btn-sm" onClick={() => onViewHistory(timer.unit)} title="View history">
            <History size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
