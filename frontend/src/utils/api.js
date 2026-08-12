// utils/api.js — all backend calls go through here
const API_BASE = import.meta.env?.VITE_API_BASE || 'http://localhost:3001/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  health: () => request('/health'),
  listTimers: () => request('/system-timers'),
  createTimer: (data) => request('/system-timers', { method: 'POST', body: JSON.stringify(data) }),
  updateTimer: (name, data) => request(`/system-timers/${name}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTimer: (name) => request(`/system-timers/${name}`, { method: 'DELETE' }),
  pauseTimer: (name) => request(`/system-timers/${name}/pause`, { method: 'PATCH', body: '{}' }),
  resumeTimer: (name) => request(`/system-timers/${name}/resume`, { method: 'PATCH', body: '{}' }),
  getHistory: (name) => request(`/system-timers/${name}/history`),
  // Movement log
  getTracked: () => request('/movement-log/tracked'),
  setTracked: (unit, tracked) => request(`/movement-log/tracked/${encodeURIComponent(unit)}`, {
    method: 'POST', body: JSON.stringify({ tracked }),
  }),
  getDaySlots: (date) => request(`/movement-log/${date}`),
  logSlot: (date, time, data) => request(`/movement-log/${date}/${time}`, {
    method: 'POST', body: JSON.stringify(data),
  }),
  getSummary: (from, to) => request(`/movement-log/summary?from=${from}&to=${to}`),
  exportUrl: (from, to, format = 'csv') =>
    `${API_BASE}/movement-log/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=${encodeURIComponent(format)}`,
};


/**
 * Build an OnCalendar string from the friendly schedule builder state.
 */
export function buildOnCalendar(mode, state) {
  if (mode === 'raw') return state.raw || '';
  if (mode === 'interval') {
    const unit = state.unit === 'hours' ? 'h' : 'min';
    return `*-*-* *:00/${state.every}:00`;
  }
  if (mode === 'daily') {
    return `*-*-* ${state.time}:00`;
  }
  if (mode === 'weekdays') {
    const days = state.days.join(',');
    return `${days} *-*-* ${state.time}:00`;
  }
  if (mode === 'workdays') {
    return `Mon-Fri *-*-* ${state.time}:00`;
  }
  if (mode === 'range') {
    return buildRangeOnCalendar(state).schedule;
  }
  return '';
}

export function buildRangeOnCalendar(state) {
  const start = state.startTime || '09:30';
  const end = state.endTime || '16:30';
  const interval = Math.max(1, Number(state.intervalMinutes || 30));
  const dayMode = state.dayMode || 'workdays';
  const days = state.days?.length ? state.days : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const dayPrefix = dayMode === 'everyday'
    ? ''
    : dayMode === 'workdays'
    ? 'Mon..Fri '
    : `${days.join(',')} `;

  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (endMin < startMin) return { schedule: '', times: [], error: 'End time must be after start time.' };

  const times = [];
  for (let minute = startMin; minute <= endMin; minute += interval) {
    times.push(minutesToTime(minute));
  }

  const schedule = times
    .map(t => `${dayPrefix}*-*-* ${t}:00`)
    .join('\n');

  return { schedule, times, error: null };
}

function timeToMinutes(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimestamp(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function categoryColor(cat) {
  const map = {
    health: '#10b981',
    work: '#3b82f6',
    chores: '#f59e0b',
    personal: '#a78bfa',
    general: '#64748b',
  };
  return map[cat] || '#64748b';
}
