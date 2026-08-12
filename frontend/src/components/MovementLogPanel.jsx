// components/MovementLogPanel.jsx
import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, SkipForward,
  Clock, TrendingUp, CalendarDays, RefreshCw, Activity, Info,
} from 'lucide-react';
import { api } from '../utils/api';

// ── Date helpers ──────────────────────────────────────────────────────────────
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatWeek(d) {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay() + 1); // Mon
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function getPastNDates(n) {
  const dates = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(toDateStr(d));
  }
  return dates;
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  done:     { label: 'Done',     color: '#10b981', bg: 'rgba(16,185,129,0.12)', icon: CheckCircle2 },
  missed:   { label: 'Missed',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  icon: XCircle },
  skipped:  { label: 'Skipped',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: SkipForward },
  pending:  { label: 'Pending',  color: '#64748b', bg: 'rgba(100,116,139,0.1)', icon: Clock },
  unlogged: { label: 'Unlogged', color: '#475569', bg: 'rgba(71,85,105,0.1)',   icon: Clock },
};

// ── SlotRow ───────────────────────────────────────────────────────────────────
function SlotRow({ slot, date, onLog }) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState(slot.reason || '');
  const [isSaving, setIsSaving] = useState(false);

  const cfg = STATUS_CONFIG[slot.status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  const canLog = slot.status === 'pending' || slot.status === 'unlogged';
  const isLogged = slot.status === 'done' || slot.status === 'missed' || slot.status === 'skipped';

  async function submit(status) {
    setIsSaving(true);
    await onLog(slot, status, reason);
    setIsSaving(false);
    setExpanded(false);
  }

  return (
    <div className={`slot-row ${isLogged ? 'slot-logged' : ''}`}
         style={{ '--slot-color': cfg.color }}>
      <div className="slot-main">
        <span className="slot-time">{slot.time}</span>
        <span className="slot-badge" style={{ background: cfg.bg, color: cfg.color }}>
          <Icon size={12} />
          {cfg.label}
        </span>
        {slot.reason && (
          <span className="slot-reason">"{slot.reason}"</span>
        )}
        <div className="slot-actions">
          {!expanded && (
            <>
              <button
                className="slot-btn slot-btn-done"
                onClick={() => submit('done')}
                disabled={isSaving}
                title="Mark Done"
              >
                <CheckCircle2 size={14} /> Done
              </button>
              <button
                className="slot-btn slot-btn-other"
                onClick={() => setExpanded(true)}
                disabled={isSaving}
                title="Log with reason"
              >
                ···
              </button>
            </>
          )}
          {isLogged && !expanded && (
            <button className="slot-btn slot-btn-edit" onClick={() => setExpanded(true)} title="Edit">
              Edit
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="slot-expand">
          <input
            className="form-input slot-reason-input"
            type="text"
            placeholder="Reason (optional)…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            maxLength={200}
            autoFocus
          />
          <div className="slot-expand-actions">
            <button className="slot-btn slot-btn-done" onClick={() => submit('done')} disabled={isSaving}>
              <CheckCircle2 size={13} /> Done
            </button>
            <button className="slot-btn slot-btn-missed" onClick={() => submit('missed')} disabled={isSaving}>
              <XCircle size={13} /> Missed
            </button>
            <button className="slot-btn slot-btn-skipped" onClick={() => submit('skipped')} disabled={isSaving}>
              <SkipForward size={13} /> Skipped
            </button>
            <button className="slot-btn slot-btn-cancel" onClick={() => setExpanded(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Compliance bar (pure SVG/CSS, no library) ─────────────────────────────────
function ComplianceBar({ done, missed, skipped, unlogged, total }) {
  if (!total) return null;
  const pctDone    = Math.round((done / total) * 100);
  const pctMissed  = Math.round((missed / total) * 100);
  const pctSkipped = Math.round((skipped / total) * 100);
  const pctOther   = 100 - pctDone - pctMissed - pctSkipped;

  return (
    <div className="compliance-bar-wrap">
      <div className="compliance-bar">
        <div style={{ width: `${pctDone}%`,    background: '#10b981' }} />
        <div style={{ width: `${pctMissed}%`,  background: '#ef4444' }} />
        <div style={{ width: `${pctSkipped}%`, background: '#f59e0b' }} />
        <div style={{ width: `${Math.max(pctOther,0)}%`, background: 'rgba(255,255,255,0.06)' }} />
      </div>
      <div className="compliance-legend">
        <span style={{ color: '#10b981' }}>● {pctDone}% done</span>
        {pctMissed  > 0 && <span style={{ color: '#ef4444'  }}>● {pctMissed}% missed</span>}
        {pctSkipped > 0 && <span style={{ color: '#f59e0b' }}>● {pctSkipped}% skipped</span>}
      </div>
    </div>
  );
}

// ── Mini chart: 14-day bar chart ──────────────────────────────────────────────
function DailyBars({ daily }) {
  if (!daily || !daily.length) return null;
  const max = Math.max(...daily.map(d => d.total || 0), 1);

  return (
    <div className="daily-bars">
      {daily.map(d => {
        const donePct    = ((d.done || 0) / max) * 100;
        const missedPct  = ((d.missed || 0) / max) * 100;
        const skippedPct = ((d.skipped || 0) / max) * 100;
        const label = d.date.slice(5); // MM-DD
        return (
          <div key={d.date} className="daily-bar-col" title={`${d.date}: ${d.done||0} done, ${d.missed||0} missed, ${d.skipped||0} skipped`}>
            <div className="daily-bar-stack">
              <div className="daily-bar-seg" style={{ height: `${donePct}%`,    background: '#10b981' }} />
              <div className="daily-bar-seg" style={{ height: `${missedPct}%`,  background: '#ef4444' }} />
              <div className="daily-bar-seg" style={{ height: `${skippedPct}%`, background: '#f59e0b' }} />
            </div>
            <div className="daily-bar-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function MovementLogPanel({ onToast }) {
  const [view, setView] = useState('today');   // 'today' | 'history'
  const [currentDate, setCurrentDate] = useState(toDateStr(new Date()));
  const [slots, setSlots] = useState([]);
  const [trackedUnits, setTrackedUnits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');

  const today = toDateStr(new Date());
  const isToday = currentDate === today;

  // ── Load day slots ──────────────────────────────────────────────────────────
  const loadDay = useCallback(async (date) => {
    setIsLoading(true);
    try {
      const data = await api.getDaySlots(date);
      setSlots(data.slots || []);
      setTrackedUnits(data.trackedUnits || []);
    } catch (err) {
      onToast?.(`Failed to load movement log: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onToast]);

  useEffect(() => { loadDay(currentDate); }, [currentDate, loadDay]);

  // ── Load summary ────────────────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      // Last 14 days
      const to = today;
      const fromD = new Date();
      fromD.setDate(fromD.getDate() - 13);
      const from = toDateStr(fromD);
      const data = await api.getSummary(from, to);
      setSummary(data);
    } catch (err) {
      onToast?.(`Failed to load summary: ${err.message}`, 'error');
    } finally {
      setSummaryLoading(false);
    }
  }, [today, onToast]);

  useEffect(() => { if (view === 'history') loadSummary(); }, [view, loadSummary]);

  // ── Log a slot ──────────────────────────────────────────────────────────────
  async function handleLog(slot, status, reason) {
    try {
      await api.logSlot(currentDate, slot.time, {
        sourceUnit: slot.sourceUnit,
        status,
        reason: reason || undefined,
      });
      await loadDay(currentDate);
    } catch (err) {
      onToast?.(err.message, 'error');
    }
  }

  // ── Day stats ───────────────────────────────────────────────────────────────
  const stats = slots.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});

  // ── No tracked timers prompt ─────────────────────────────────────────────────
  const noTracked = !isLoading && trackedUnits.length === 0;
  const todayTally = [
    ['done', stats.done || 0],
    ['missed', stats.missed || 0],
    ['skipped', stats.skipped || 0],
    ['pending', stats.pending || 0],
    ['unlogged', stats.unlogged || 0],
  ].filter(([status, count]) => count > 0 || ['done', 'pending'].includes(status));

  function handleExport() {
    const to = today;
    const fromD = new Date();
    fromD.setDate(fromD.getDate() - 13);
    const from = toDateStr(fromD);
    const a = document.createElement('a');
    a.href = api.exportUrl(from, to, exportFormat);
    a.download = `chronos-movement-${from}-to-${to}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div>
      {/* Sub-nav */}
      <div className="movement-subnav">
        <button
          className={`tab-btn${view === 'today' ? ' active' : ''}`}
          onClick={() => setView('today')}
          style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
        >
          <CalendarDays size={14} /> Today
        </button>
        <button
          className={`tab-btn${view === 'history' ? ' active' : ''}`}
          onClick={() => setView('history')}
          style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}
        >
          <TrendingUp size={14} /> History (14 days)
        </button>
      </div>

      {/* ── TODAY VIEW ── */}
      {view === 'today' && (
        <div>
          {/* Date navigation */}
          <div className="date-nav">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const d = new Date(currentDate + 'T00:00:00');
                d.setDate(d.getDate() - 1);
                setCurrentDate(toDateStr(d));
              }}
            >
              <ChevronLeft size={16} />
            </button>

            <div className="date-display">
              <span className="date-label">{formatDisplayDate(currentDate)}</span>
              {!isToday && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCurrentDate(today)}
                  style={{ fontSize: '0.75rem', marginLeft: '8px' }}
                >
                  Today
                </button>
              )}
            </div>

            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const d = new Date(currentDate + 'T00:00:00');
                d.setDate(d.getDate() + 1);
                const next = toDateStr(d);
                if (next <= today) setCurrentDate(next);
              }}
              disabled={currentDate >= today}
            >
              <ChevronRight size={16} />
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={() => loadDay(currentDate)}
              title="Refresh"
              disabled={isLoading}
            >
              <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            </button>
          </div>

          {/* No tracked timers */}
          {noTracked && (
            <div className="movement-empty">
              <Activity size={36} style={{ opacity: 0.25, marginBottom: '0.75rem' }} />
              <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No timers are being tracked yet.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '380px', textAlign: 'center' }}>
                Go to the <strong>System Alerts</strong> tab, open a timer card, and toggle it as a <strong>Health</strong> category timer — then enable tracking from the timer menu.
              </p>
              <div className="movement-info-box">
                <Info size={14} />
                Alternatively, your <code>movebreak.timer</code> is already set up. Toggle it tracked from System Alerts → movebreak → Track toggle.
              </div>
            </div>
          )}

          {/* Day stats summary */}
          {!noTracked && slots.length > 0 && (
            <>
              <div className="today-tally-strip">
                <Activity size={14} />
                <span className="today-tally-title">Today so far</span>
                {todayTally.map(([status, count]) => {
                  const cfg = STATUS_CONFIG[status];
                  return (
                    <span key={status} className="today-tally-pill" style={{ color: cfg.color }}>
                      ● {count} {cfg.label.toLowerCase()}
                    </span>
                  );
                })}
              </div>
              <ComplianceBar
                done={stats.done || 0}
                missed={stats.missed || 0}
                skipped={stats.skipped || 0}
                unlogged={stats.unlogged || 0}
                total={slots.length}
              />
            </>
          )}

          {/* Slot list */}
          {isLoading ? (
            <div className="loading-state"><div className="spinner" /><span>Loading slots…</span></div>
          ) : !noTracked && slots.length === 0 ? (
            <div className="empty-state">
              <p>No movement breaks scheduled for this day.</p>
            </div>
          ) : (
            <div className="slot-list">
              {slots.map(slot => (
                <SlotRow
                  key={`${slot.time}|${slot.sourceUnit}`}
                  slot={slot}
                  date={currentDate}
                  onLog={handleLog}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {view === 'history' && (
        <div>
          {summaryLoading ? (
            <div className="loading-state"><div className="spinner" /><span>Loading history…</span></div>
          ) : !summary || !summary.daily.length ? (
            <div className="empty-state">
              <TrendingUp size={36} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
              <p>No movement data logged yet.</p>
              <p style={{ fontSize: '0.85rem' }}>Start logging breaks in the Today view to see history here.</p>
            </div>
          ) : (
            <>
              {/* Totals */}
              <div className="history-totals">
                <div className="history-total-card" style={{ '--tc': '#10b981' }}>
                  <span className="history-total-num">{summary.totals.done || 0}</span>
                  <span className="history-total-label">Done</span>
                </div>
                <div className="history-total-card" style={{ '--tc': '#ef4444' }}>
                  <span className="history-total-num">{summary.totals.missed || 0}</span>
                  <span className="history-total-label">Missed</span>
                </div>
                <div className="history-total-card" style={{ '--tc': '#f59e0b' }}>
                  <span className="history-total-num">{summary.totals.skipped || 0}</span>
                  <span className="history-total-label">Skipped</span>
                </div>
                <div className="history-total-card" style={{ '--tc': '#64748b' }}>
                  <span className="history-total-num">
                    {summary.totals.total
                      ? Math.round(((summary.totals.done || 0) / summary.totals.total) * 100)
                      : 0}%
                  </span>
                  <span className="history-total-label">Compliance</span>
                </div>
              </div>

              {/* Bar chart */}
              <div className="timer-card" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
                <div className="history-heading-row">
                  <h4 className="history-section-title">Daily breakdown (last 14 days)</h4>
                  <div className="export-controls">
                    <select
                      className="form-input export-format"
                      value={exportFormat}
                      onChange={e => setExportFormat(e.target.value)}
                      aria-label="Export format"
                    >
                      <option value="csv">CSV</option>
                      <option value="json">JSON</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={handleExport}>
                      Export
                    </button>
                  </div>
                </div>
                <DailyBars daily={summary.daily} />
              </div>

              {/* Top reasons */}
              {summary.reasons.length > 0 && (
                <div className="timer-card" style={{ padding: '1.25rem' }}>
                  <h4 className="history-section-title">Most common reasons for missing/skipping</h4>
                  <ul className="reason-list">
                    {summary.reasons.map((r, i) => (
                      <li key={i} className="reason-item">
                        <span className="reason-text">"{r.reason}"</span>
                        <span className="reason-count">{r.count}×</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
