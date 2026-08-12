// components/TimerForm.jsx — create & edit system timers
import { useState, useEffect } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { ScheduleBuilder } from './ScheduleBuilder';
import { buildOnCalendar } from '../utils/api';

const CATEGORIES = ['general', 'health', 'work', 'chores', 'personal'];

const DEFAULT_SCHEDULE = [
  'Mon..Fri *-*-* 09:30:00',
  'Mon..Fri *-*-* 10:00:00',
  'Mon..Fri *-*-* 10:30:00',
  'Mon..Fri *-*-* 11:00:00',
  'Mon..Fri *-*-* 11:30:00',
  'Mon..Fri *-*-* 12:00:00',
  'Mon..Fri *-*-* 12:30:00',
  'Mon..Fri *-*-* 13:00:00',
  'Mon..Fri *-*-* 13:30:00',
  'Mon..Fri *-*-* 14:00:00',
  'Mon..Fri *-*-* 14:30:00',
  'Mon..Fri *-*-* 15:00:00',
  'Mon..Fri *-*-* 15:30:00',
  'Mon..Fri *-*-* 16:00:00',
  'Mon..Fri *-*-* 16:30:00',
].join('\n');

export function TimerForm({ editingTimer, onSubmit, onCancel, isSubmitting }) {
  const isEdit = !!editingTimer;

  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (editingTimer) {
      setName(editingTimer.unit.replace(/^custom-|\.timer$/g, ''));
      setMessage(editingTimer.message || '');
      setCategory(editingTimer.category || 'general');
      setSchedule(editingTimer.schedule || DEFAULT_SCHEDULE);
    } else {
      setName('');
      setMessage('');
      setCategory('general');
      setSchedule(DEFAULT_SCHEDULE);
    }
    setNameError('');
  }, [editingTimer]);

  function validateNameField(val) {
    if (!val) return 'Name is required.';
    if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(val)) {
      return 'Lowercase letters, digits and hyphens only (1–48 chars, start with letter/digit).';
    }
    return '';
  }

  function handleNameChange(e) {
    const val = e.target.value.toLowerCase();
    setName(val);
    setNameError(validateNameField(val));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validateNameField(name);
    if (err) { setNameError(err); return; }
    if (!schedule) return;
    onSubmit({ name, message, category, schedule });
  }

  return (
    <div className="timer-card form-card">
      <div className="form-card-header">
        <h3>{isEdit ? <><Save size={18}/> Edit Timer</> : <><Plus size={18}/> Create System Timer</>}</h3>
        {isEdit && (
          <button className="btn btn-ghost btn-sm" onClick={onCancel} type="button">
            <X size={16} /> Cancel
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-grid-2">
          {/* Name — only editable on create */}
          <div className="form-group">
            <label className="form-label" htmlFor="timer-name">Name</label>
            <input
              id="timer-name"
              type="text"
              className={`form-input${nameError ? ' input-error' : ''}`}
              placeholder="e.g. hydrate"
              value={name}
              onChange={handleNameChange}
              disabled={isEdit}
              required
            />
            {nameError && <span className="form-error">{nameError}</span>}
          </div>

          {/* Category */}
          <div className="form-group">
            <label className="form-label" htmlFor="timer-category">Category</label>
            <select
              id="timer-category"
              className="form-input"
              value={category}
              onChange={e => setCategory(e.target.value)}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>

          {/* Message */}
          <div className="form-group form-group-full">
            <label className="form-label" htmlFor="timer-message">Notification message</label>
            <input
              id="timer-message"
              type="text"
              className="form-input"
              placeholder="Time to stand up and move!"
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Schedule builder */}
        <ScheduleBuilder value={schedule} onChange={setSchedule} />

        <div className="form-actions">
          <button
            id="timer-submit-btn"
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting || !!validateNameField(name) || !schedule}
          >
            {isSubmitting ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Timer')}
          </button>
        </div>
      </form>
    </div>
  );
}
