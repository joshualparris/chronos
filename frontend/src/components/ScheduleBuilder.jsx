// components/ScheduleBuilder.jsx
// Human-friendly schedule builder that generates an OnCalendar= string.
import { useState } from 'react';
import { buildOnCalendar, buildRangeOnCalendar } from '../utils/api';
import { ChevronDown } from 'lucide-react';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MODES = [
  { value: 'interval', label: 'Every N minutes/hours' },
  { value: 'range', label: 'Interval within a time range' },
  { value: 'workdays', label: 'Weekdays at time (Mon–Fri)' },
  { value: 'daily', label: 'Every day at time' },
  { value: 'weekdays', label: 'Specific days at time' },
  { value: 'raw', label: 'Advanced (raw OnCalendar)' },
];

export function ScheduleBuilder({ value, onChange }) {
  const [mode, setMode] = useState('workdays');
  const [every, setEvery] = useState('30');
  const [unit, setUnit] = useState('minutes');
  const [time, setTime] = useState('09:00');
  const [startTime, setStartTime] = useState('09:30');
  const [endTime, setEndTime] = useState('16:30');
  const [intervalMinutes, setIntervalMinutes] = useState('30');
  const [dayMode, setDayMode] = useState('workdays');
  const [days, setDays] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [raw, setRaw] = useState(value || '');

  function emit(newMode, state) {
    const cal = buildOnCalendar(newMode, state);
    onChange(cal);
  }

  function handleModeChange(e) {
    const m = e.target.value;
    setMode(m);
    emit(m, { every, unit, time, startTime, endTime, intervalMinutes, dayMode, days, raw });
  }

  function handleEveryChange(e) {
    setEvery(e.target.value);
    emit(mode, { every: e.target.value, unit, time, days, raw });
  }

  function handleTimeChange(e) {
    setTime(e.target.value);
    emit(mode, { every, unit, time: e.target.value, days, raw });
  }

  function handleDayToggle(day) {
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    setDays(next);
    emit(mode, { every, unit, time, startTime, endTime, intervalMinutes, dayMode, days: next, raw });
  }

  function handleRangeChange(patch) {
    const next = { every, unit, time, startTime, endTime, intervalMinutes, dayMode, days, raw, ...patch };
    if (patch.startTime !== undefined) setStartTime(patch.startTime);
    if (patch.endTime !== undefined) setEndTime(patch.endTime);
    if (patch.intervalMinutes !== undefined) setIntervalMinutes(patch.intervalMinutes);
    if (patch.dayMode !== undefined) setDayMode(patch.dayMode);
    emit(mode, next);
  }

  function handleRawChange(e) {
    setRaw(e.target.value);
    onChange(e.target.value);
  }

  return (
    <div className="schedule-builder">
      <div className="schedule-mode-selector form-group">
        <label className="form-label">Schedule type</label>
        <div className="select-wrapper">
          <select className="form-input" value={mode} onChange={handleModeChange} id="schedule-mode">
            {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <ChevronDown size={16} className="select-icon" />
        </div>
      </div>

      {mode === 'interval' && (
        <div className="schedule-row">
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Every</label>
            <input
              type="number" className="form-input" min="1" max="59"
              value={every} onChange={handleEveryChange}
              id="interval-every"
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Unit</label>
            <div className="select-wrapper">
              <select className="form-input" value={unit} id="interval-unit"
                onChange={e => { setUnit(e.target.value); emit(mode, { every, unit: e.target.value, time, startTime, endTime, intervalMinutes, dayMode, days, raw }); }}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
              </select>
              <ChevronDown size={16} className="select-icon" />
            </div>
          </div>
        </div>
      )}

      {mode === 'range' && (
        <>
          <div className="schedule-row">
            <div className="form-group">
              <label className="form-label">Start time</label>
              <input type="time" className="form-input" value={startTime}
                onChange={e => handleRangeChange({ startTime: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">End time</label>
              <input type="time" className="form-input" value={endTime}
                onChange={e => handleRangeChange({ endTime: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Every minutes</label>
              <input type="number" className="form-input" min="1" max="240" value={intervalMinutes}
                onChange={e => handleRangeChange({ intervalMinutes: e.target.value })} />
            </div>
          </div>

          <div className="schedule-row">
            <div className="form-group">
              <label className="form-label">Days</label>
              <div className="select-wrapper">
                <select className="form-input" value={dayMode}
                  onChange={e => handleRangeChange({ dayMode: e.target.value })}>
                  <option value="workdays">Weekdays (Mon–Fri)</option>
                  <option value="everyday">Every day</option>
                  <option value="specific">Specific days</option>
                </select>
                <ChevronDown size={16} className="select-icon" />
              </div>
            </div>
          </div>

          {dayMode === 'specific' && (
            <div className="form-group">
              <label className="form-label">Specific days</label>
              <div className="day-picker">
                {DAYS_OF_WEEK.map(d => (
                  <button
                    key={d}
                    type="button"
                    className={`day-btn${days.includes(d) ? ' active' : ''}`}
                    onClick={() => handleDayToggle(d)}
                  >
                    {d.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {(mode === 'daily' || mode === 'workdays') && (
        <div className="form-group">
          <label className="form-label">At time</label>
          <input type="time" className="form-input" value={time} onChange={handleTimeChange} id="schedule-time" />
        </div>
      )}

      {mode === 'weekdays' && (
        <>
          <div className="form-group">
            <label className="form-label">Days</label>
            <div className="day-picker">
              {DAYS_OF_WEEK.map(d => (
                <button
                  key={d}
                  type="button"
                  className={`day-btn${days.includes(d) ? ' active' : ''}`}
                  onClick={() => handleDayToggle(d)}
                >
                  {d.slice(0, 2)}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">At time</label>
            <input type="time" className="form-input" value={time} onChange={handleTimeChange} id="weekday-time" />
          </div>
        </>
      )}

      {mode === 'raw' && (
        <div className="form-group">
          <label className="form-label">OnCalendar expression</label>
          <input
            type="text" className="form-input"
            placeholder="Mon-Fri *-*-* 09..17:00/30:00"
            value={raw} onChange={handleRawChange}
            id="raw-schedule"
          />
        </div>
      )}

      <div className="schedule-preview">
        <span className="schedule-preview-label">Preview:</span>
        <code className="schedule-preview-value">{value || '—'}</code>
      </div>

      {mode === 'range' && (
        <div className="schedule-range-preview">
          {(() => {
            const built = buildRangeOnCalendar({ startTime, endTime, intervalMinutes, dayMode, days });
            if (built.error) return <span className="form-error">{built.error}</span>;
            return (
              <>
                <span className="schedule-preview-label">Resolved times:</span>
                <span className="schedule-times-list">
                  {built.times.join(', ')} — {built.times.length} time{built.times.length === 1 ? '' : 's'}/day
                </span>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
