/**
 * routes/movementLog.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const {
  getTrackedUnits,
  setTracked,
  getSlotsForDate,
  upsertLogEntry,
  getSummary,
  getRows,
  toLocalDateStr,
} = require('../services/movementLogService');
const { computeSlotsForDate } = require('../services/systemdService');
const { validateUnitName } = require('../validators/timerValidator');
const systemd = require('../services/systemdService');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const VALID_STATUSES = ['done', 'missed', 'skipped', 'pending'];

function fail(res, status, message, code) {
  return res.status(status).json({ error: message, code: code || 'ERROR' });
}

function validDate(d) { return DATE_RE.test(d) && !isNaN(Date.parse(d)); }
function validTime(t) { return TIME_RE.test(t); }

// ── GET /api/movement-log/tracked ────────────────────────────────────────────
// Returns the list of tracked timer unit names
router.get('/tracked', (_req, res) => {
  res.json({ tracked: getTrackedUnits() });
});

// ── POST /api/movement-log/tracked/:unit ─────────────────────────────────────
// Toggle tracking on/off for a custom timer
router.post('/tracked/:unit', (req, res) => {
  const { unit } = req.params;
  // Allow custom timers OR the special movebreak.timer (since users may track it)
  // Validate: must be a .timer name we'd accept
  if (!/^[a-z0-9][a-z0-9._-]+\.timer$/.test(unit) || unit.includes('..')) {
    return fail(res, 400, 'Invalid unit name.', 'INVALID_UNIT_NAME');
  }
  const { tracked } = req.body;
  if (typeof tracked !== 'boolean') return fail(res, 400, 'tracked must be a boolean.', 'INVALID_INPUT');

  const list = setTracked(unit, tracked);
  res.json({ tracked: list });
});

// ── GET /api/movement-log/summary ────────────────────────────────────────────
router.get('/summary', (req, res) => {
  // kept below export route? Express route order means /summary is exact enough.
  return handleSummary(req, res);
});

router.get('/export', async (req, res) => {
  const today = toLocalDateStr();
  const { from = today, to = today, format = 'csv' } = req.query;
  if (!validDate(from) || !validDate(to)) return fail(res, 400, 'Invalid date range.', 'INVALID_DATE');
  if (from > to) return fail(res, 400, 'from must be ≤ to.', 'INVALID_DATE');
  if (!['csv', 'json'].includes(format)) return fail(res, 400, 'format must be csv or json.', 'INVALID_FORMAT');

  try {
    await materializeRange(from, to);
    const rows = getRows(from, to);
    if (format === 'json') return res.json({ from, to, rows });

    const csv = toCsv(rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chronos-movement-${from}-to-${to}.csv"`);
    return res.send(csv);
  } catch (err) {
    return fail(res, 500, err.message, 'DB_ERROR');
  }
});

async function handleSummary(req, res) {
  const today = toLocalDateStr();
  const { from = today, to = today } = req.query;
  if (!validDate(from) || !validDate(to)) return fail(res, 400, 'Invalid date range.', 'INVALID_DATE');
  if (from > to) return fail(res, 400, 'from must be ≤ to.', 'INVALID_DATE');

  try {
    await materializeRange(from, to);
    const summary = getSummary(from, to);
    return res.json(summary);
  } catch (err) {
    return fail(res, 500, err.message, 'DB_ERROR');
  }
}

// ── GET /api/movement-log/:date ───────────────────────────────────────────────
router.get('/:date', async (req, res) => {
  const { date } = req.params;
  if (!validDate(date)) return fail(res, 400, 'Invalid date (expected YYYY-MM-DD).', 'INVALID_DATE');

  const trackedUnits = getTrackedUnits();
  if (trackedUnits.length === 0) {
    return res.json({ date, slots: [], trackedUnits: [] });
  }

  // Build onCalendar map: unit → OnCalendar expression
  // We read it from the unit file on disk
  const onCalendarMap = {};
  for (const unit of trackedUnits) {
    const schedule = readOnCalendarFromUnit(unit);
    if (schedule) onCalendarMap[unit] = schedule;
  }

  try {
    const slots = await getSlotsForDate(date, computeSlotsForDate, onCalendarMap);
    return res.json({ date, slots, trackedUnits });
  } catch (err) {
    console.error('[movement-log] getSlotsForDate error:', err);
    return fail(res, 500, err.message, 'COMPUTE_ERROR');
  }
});

// ── POST /api/movement-log/:date/:time ───────────────────────────────────────
router.post('/:date/:time', (req, res) => {
  const { date, time } = req.params;
  if (!validDate(date)) return fail(res, 400, 'Invalid date.', 'INVALID_DATE');
  if (!validTime(time)) return fail(res, 400, 'Invalid time (expected HH:MM).', 'INVALID_TIME');

  const { sourceUnit, status, reason } = req.body || {};

  if (!sourceUnit || !/^[a-z0-9][a-z0-9._-]+\.timer$/.test(sourceUnit)) {
    return fail(res, 400, 'Invalid sourceUnit.', 'INVALID_UNIT_NAME');
  }
  if (!VALID_STATUSES.includes(status)) {
    return fail(res, 400, `status must be one of: ${VALID_STATUSES.join(', ')}.`, 'INVALID_STATUS');
  }
  if (reason && typeof reason !== 'string') {
    return fail(res, 400, 'reason must be a string.', 'INVALID_INPUT');
  }
  const cleanReason = reason ? String(reason).slice(0, 200) : null;

  try {
    upsertLogEntry({ date, expectedTime: time, sourceUnit, status, reason: cleanReason });
    return res.json({ success: true });
  } catch (err) {
    return fail(res, 500, err.message, 'DB_ERROR');
  }
});

// ── Helper: read OnCalendar from unit file ────────────────────────────────────
function readOnCalendarFromUnit(unitName) {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const dir = process.env.CHRONOS_SYSTEMD_DIR || path.join(os.homedir(), '.config', 'systemd', 'user');
  const timerPath = path.join(dir, unitName);
  try {
    const content = fs.readFileSync(timerPath, 'utf8');
    const matches = [...content.matchAll(/^OnCalendar=(.+)$/gm)].map(m => m[1].trim()).filter(Boolean);
    return matches.length ? matches.join('\n') : null;
  } catch {
    return null;
  }
}

async function materializeRange(from, to) {
  const onCalendarMap = {};
  for (const unit of getTrackedUnits()) {
    const schedule = readOnCalendarFromUnit(unit);
    if (schedule) onCalendarMap[unit] = schedule;
  }
  if (Object.keys(onCalendarMap).length === 0) return;

  for (const date of datesBetween(from, to)) {
    if (date <= toLocalDateStr()) {
      await getSlotsForDate(date, computeSlotsForDate, onCalendarMap);
    }
  }
}

function datesBetween(from, to) {
  const dates = [];
  const d = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (d <= end) {
    dates.push(toLocalDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function toCsv(rows) {
  const header = ['date', 'expectedTime', 'status', 'reason', 'loggedAt', 'sourceTimerUnit'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map(k => csvCell(row[k])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

module.exports = router;
