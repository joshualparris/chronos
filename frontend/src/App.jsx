import { useState, useEffect, useCallback } from 'react';
import { Clock, Terminal, Zap, Search, RefreshCw, AlertTriangle, Activity } from 'lucide-react';

import { api } from './utils/api';
import { useToast } from './hooks/useToast';

import { ToastContainer } from './components/ToastContainer';
import { TimerForm } from './components/TimerForm';
import { SystemTimerCard } from './components/SystemTimerCard';
import { QuickTimerPanel } from './components/QuickTimerPanel';
import { MovementLogPanel } from './components/MovementLogPanel';
import { ConfirmDialog } from './components/ConfirmDialog';
import { HistoryDrawer } from './components/HistoryDrawer';

import './index.css';

export default function App() {
  const initialTab = new URLSearchParams(window.location.search).get('tab') === 'movement'
    ? 'movement'
    : 'system';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { toasts, addToast, removeToast } = useToast();

  // ── System timers state ──────────────────────────────────────────────
  const [timers, setTimers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [healthState, setHealthState] = useState({ ok: true, reason: null, detail: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTimer, setEditingTimer] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pausedUnits, setPausedUnits] = useState(new Set());
  const [trackedUnits, setTrackedUnits] = useState(new Set());

  // ── Confirm dialog ───────────────────────────────────────────────────
  const [confirmState, setConfirmState] = useState({ open: false, timer: null });

  // ── History drawer ───────────────────────────────────────────────────
  const [historyState, setHistoryState] = useState({ unit: null, lines: [] });

  // ── Health check + initial load ──────────────────────────────────────
  const checkHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setHealthState({ ok: h.ok, reason: h.reason, detail: h.detail, state: h.state });
    } catch (err) {
      // Network failure — backend unreachable
      setHealthState({ ok: false, reason: 'Cannot reach the Chronos backend.', detail: err.message });
    }
  }, []);

  const fetchTracked = useCallback(async () => {
    try {
      const { tracked } = await api.getTracked();
      setTrackedUnits(new Set(tracked));
    } catch {}
  }, []);

  const fetchTimers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.listTimers();
      setTimers(data);
    } catch (err) {
      addToast(`Failed to load timers: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    checkHealth();
    fetchTimers();
    fetchTracked();
  }, [checkHealth, fetchTimers, fetchTracked]);

  // ── CRUD handlers ────────────────────────────────────────────────────
  const handleCreateOrEdit = async ({ name, message, category, schedule }) => {
    setIsSubmitting(true);
    try {
      if (editingTimer) {
        await api.updateTimer(editingTimer.unit, { message, category, schedule });
        addToast(`Timer "${editingTimer.unit.replace(/^custom-|\.timer$/g, '')}" updated.`);
        setEditingTimer(null);
      } else {
        await api.createTimer({ name, message, category, schedule });
        addToast(`Timer "${name}" created and enabled.`);
      }
      await fetchTimers();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRequest = (timer) => setConfirmState({ open: true, timer });

  const handleDeleteConfirm = async () => {
    const { timer } = confirmState;
    setConfirmState({ open: false, timer: null });
    try {
      await api.deleteTimer(timer.unit);
      addToast(`Timer "${timer.unit.replace(/^custom-|\.timer$/g, '')}" deleted.`);
      await fetchTimers();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handlePause = async (unit) => {
    try {
      await api.pauseTimer(unit);
      setPausedUnits(prev => new Set([...prev, unit]));
      addToast('Timer paused.');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleResume = async (unit) => {
    try {
      await api.resumeTimer(unit);
      setPausedUnits(prev => { const s = new Set(prev); s.delete(unit); return s; });
      addToast('Timer resumed.');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleViewHistory = async (unit) => {
    try {
      const { history } = await api.getHistory(unit);
      setHistoryState({ unit, lines: history });
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleToggleTracked = async (unit, tracked) => {
    try {
      const { tracked: list } = await api.setTracked(unit, tracked);
      setTrackedUnits(new Set(list));
      addToast(tracked ? `"${unit}" is now tracked as a movement break.` : `"${unit}" tracking removed.`);
    } catch (err) { addToast(err.message, 'error'); }
  };

  // ── Filtered timer list ──────────────────────────────────────────────
  const filteredTimers = timers.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return t.unit.toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q);
  });

  // ── Health warning message ───────────────────────────────────────────
  const healthWarning = !healthState.ok
    ? healthState.reason || 'systemd user services are not available.'
    : healthState.state === 'degraded'
    ? null  // degraded but working — show inline detail on hover, not a blocking banner
    : null;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ConfirmDialog
        isOpen={confirmState.open}
        title="Delete timer?"
        message={`This will permanently remove "${confirmState.timer?.unit.replace(/^custom-|\.timer$/g, '')}". This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmState({ open: false, timer: null })}
      />
      <HistoryDrawer
        unit={historyState.unit}
        history={historyState.lines}
        onClose={() => setHistoryState({ unit: null, lines: [] })}
      />

      <div className="glass-panel">
        <header className="header">
          <div className="header-title">
            <Clock size={30} />
            Chronos
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={fetchTimers}
            title="Refresh timers"
            disabled={isLoading}
          >
            <RefreshCw size={15} className={isLoading ? 'spin' : ''} />
          </button>
        </header>

        {healthWarning && (
          <div className="system-warning">
            <AlertTriangle size={18} />
            <div>
              <strong>{healthWarning}</strong>
              {healthState.detail && (
                <div style={{ fontSize: '0.82rem', marginTop: '3px', opacity: 0.85 }}>
                  {healthState.detail}
                </div>
              )}
            </div>
          </div>
        )}

        <nav className="tabs" role="tablist">
          <button
            id="tab-system"
            role="tab"
            aria-selected={activeTab === 'system'}
            className={`tab-btn${activeTab === 'system' ? ' active' : ''}`}
            onClick={() => setActiveTab('system')}
          >
            <Terminal size={15} /> System Alerts
          </button>
          <button
            id="tab-movement"
            role="tab"
            aria-selected={activeTab === 'movement'}
            className={`tab-btn${activeTab === 'movement' ? ' active' : ''}`}
            onClick={() => setActiveTab('movement')}
          >
            <Activity size={15} /> Movement Log
          </button>
          <button
            id="tab-quick"
            role="tab"
            aria-selected={activeTab === 'local'}
            className={`tab-btn${activeTab === 'local' ? ' active' : ''}`}
            onClick={() => setActiveTab('local')}
          >
            <Zap size={15} /> Quick Timers
          </button>
        </nav>

        {activeTab === 'system' && (
          <div>
            <TimerForm
              editingTimer={editingTimer}
              onSubmit={handleCreateOrEdit}
              onCancel={() => setEditingTimer(null)}
              isSubmitting={isSubmitting}
            />

            <div className="search-bar">
              <Search size={16} className="search-icon" />
              <input
                id="timer-search"
                type="text"
                className="search-input"
                placeholder="Search timers by name or category…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {isLoading ? (
              <div className="loading-state">
                <div className="spinner" />
                <span>Loading timers…</span>
              </div>
            ) : (
              <div className="timers-grid">
                {filteredTimers.length === 0 ? (
                  <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                    <Clock size={36} style={{ marginBottom: '0.5rem', opacity: 0.25 }} />
                    <p>{searchQuery ? 'No timers match your search.' : 'No systemd timers found.'}</p>
                  </div>
                ) : (
                  filteredTimers.map(timer => (
                    <SystemTimerCard
                      key={timer.id}
                      timer={timer}
                      isPaused={pausedUnits.has(timer.unit)}
                      isTracked={trackedUnits.has(timer.unit)}
                      onDelete={handleDeleteRequest}
                      onPause={handlePause}
                      onResume={handleResume}
                      onEdit={t => setEditingTimer(t)}
                      onViewHistory={handleViewHistory}
                      onToggleTracked={handleToggleTracked}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'movement' && (
          <MovementLogPanel onToast={addToast} />
        )}

        {activeTab === 'local' && (
          <QuickTimerPanel onToast={addToast} />
        )}
      </div>
    </>
  );
}
