/**
 * services/movementLogService.js
 *
 * Persistence: SQLite (better-sqlite3) — synchronous, zero-config, single file.
 * Rationale over JSON: no full-file parse/write on every read, no write races,
 * handles years of daily records efficiently, and SQL makes the summary queries trivial.
 *
 * Tracked timers: stored in a JSON sidecar (~/.chronos/tracked.json) rather than SQLite
 * because it's config-like state that needs to survive timer unit deletion/recreation.
 *
 * Security: computeSlotsForDate uses execFile with argv arrays (see systemdService.js).
 */

'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = process.env.CHRONOS_DATA_DIR || path.join(os.homedir(), '.chronos');
const DB_PATH = path.join(DATA_DIR, 'movement-log.db');
const TRACKED_PATH = path.join(DATA_DIR, 'tracked.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

// ── DB init ───────────────────────────────────────────────────────────────────

let _db = null;

function getDb() {
  if (_db) return _db;
  ensureDataDir();
  _db = new Database(DB_PATH, { fileMustExist: false });
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS movement_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      date            TEXT    NOT NULL,   -- YYYY-MM-DD
      expected_time   TEXT    NOT NULL,   -- HH:MM
      source_unit     TEXT    NOT NULL,   -- timer unit name
      status          TEXT    NOT NULL DEFAULT 'pending',
                                          -- pending|done|missed|skipped|unlogged
      reason          TEXT,
      logged_at       INTEGER,            -- unix ms
      UNIQUE(date, expected_time, source_unit)
    );
    CREATE INDEX IF NOT EXISTS idx_date ON movement_log(date);
  `);
  return _db;
}

// ── Tracked timer config ──────────────────────────────────────────────────────

function loadTracked() {
  ensureDataDir();
  try {
    return JSON.parse(fs.readFileSync(TRACKED_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveTracked(data) {
  ensureDataDir();
  fs.writeFileSync(TRACKED_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function getTrackedUnits() {
  return Object.keys(loadTracked());
}

function setTracked(unitName, tracked) {
  const data = loadTracked();
  if (tracked) {
    data[unitName] = { trackedSince: new Date().toISOString() };
  } else {
    delete data[unitName];
  }
  saveTracked(data);
  return Object.keys(data);
}

// ── Slot computation ──────────────────────────────────────────────────────────

/**
 * Build the full slot list for a given date, merging computed schedule slots
 * with any existing DB log entries.
 * computeSlots: async fn(onCalendar, dateStr) → string[] of "HH:MM"
 */
async function getSlotsForDate(dateStr, computeSlots, onCalendarMap) {
  const db = getDb();
  const now = new Date();
  const nowDateStr = toLocalDateStr(now);
  const isToday = dateStr === nowDateStr;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Fetch all existing log rows for this date
  const rows = db.prepare(
    'SELECT * FROM movement_log WHERE date = ? ORDER BY expected_time ASC'
  ).all(dateStr);

  const logged = new Map();
  for (const r of rows) {
    logged.set(`${r.expected_time}|${r.source_unit}`, r);
  }

  const slots = [];

  const rowsToMaterialize = [];

  for (const [unit, onCalendar] of Object.entries(onCalendarMap)) {
    const times = await computeSlots(onCalendar, dateStr);
    for (const time of times) {
      const key = `${time}|${unit}`;
      const existing = logged.get(key);

      if (existing) {
        slots.push({
          time,
          sourceUnit: unit,
          status: existing.status,
          reason: existing.reason || null,
          loggedAt: existing.logged_at || null,
        });
      } else {
        // Derive default status for un-logged slots
        let status = 'pending';
        if (!isToday) {
          status = 'unlogged';
        } else {
          const [h, m] = time.split(':').map(Number);
          const slotMinutes = h * 60 + m;
          if (slotMinutes < nowMinutes) status = 'unlogged';
        }
        const slot = { time, sourceUnit: unit, status, reason: null, loggedAt: null };
        slots.push(slot);
        if (status === 'unlogged') rowsToMaterialize.push(slot);
      }
    }
  }

  if (rowsToMaterialize.length > 0) {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO movement_log (date, expected_time, source_unit, status, reason, logged_at)
      VALUES (?, ?, ?, 'unlogged', NULL, NULL)
    `);
    const tx = db.transaction((rows) => {
      for (const row of rows) insert.run(dateStr, row.time, row.sourceUnit);
    });
    tx(rowsToMaterialize);
  }

  return slots.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Upsert a log entry. status must be one of done|missed|skipped|pending.
 */
function upsertLogEntry({ date, expectedTime, sourceUnit, status, reason }) {
  if (!['done', 'missed', 'skipped', 'pending', 'unlogged'].includes(status)) {
    const err = new Error(`Invalid status: ${status}`);
    err.code = 'INVALID_STATUS';
    throw err;
  }
  const db = getDb();
  db.prepare(`
    INSERT INTO movement_log (date, expected_time, source_unit, status, reason, logged_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, expected_time, source_unit)
    DO UPDATE SET status = excluded.status, reason = excluded.reason, logged_at = excluded.logged_at
  `).run(date, expectedTime, sourceUnit, status, reason || null, Date.now());
}

/**
 * Summary aggregation for a date range — counts per status per day plus top reasons.
 */
function getSummary(fromDate, toDate) {
  const db = getDb();

  // Per-day counts
  const daily = db.prepare(`
    SELECT date,
           SUM(CASE WHEN status='done'    THEN 1 ELSE 0 END) as done,
           SUM(CASE WHEN status='missed'  THEN 1 ELSE 0 END) as missed,
           SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) as skipped,
           SUM(CASE WHEN status='unlogged'THEN 1 ELSE 0 END) as unlogged,
           COUNT(*) as total
    FROM movement_log
    WHERE date BETWEEN ? AND ?
    GROUP BY date
    ORDER BY date ASC
  `).all(fromDate, toDate);

  // Top missed/skipped reasons
  const reasons = db.prepare(`
    SELECT reason, COUNT(*) as count
    FROM movement_log
    WHERE date BETWEEN ? AND ?
      AND reason IS NOT NULL AND reason != ''
      AND status IN ('missed','skipped')
    GROUP BY reason
    ORDER BY count DESC
    LIMIT 10
  `).all(fromDate, toDate);

  // Totals
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN status='done'    THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status='missed'  THEN 1 ELSE 0 END) as missed,
      SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) as skipped,
      SUM(CASE WHEN status='unlogged'THEN 1 ELSE 0 END) as unlogged,
      COUNT(*) as total
    FROM movement_log
    WHERE date BETWEEN ? AND ?
  `).get(fromDate, toDate);

  return { daily, reasons, totals };
}

function getRows(fromDate, toDate) {
  return getDb().prepare(`
    SELECT date,
           expected_time AS expectedTime,
           source_unit AS sourceTimerUnit,
           status,
           reason,
           logged_at AS loggedAt
    FROM movement_log
    WHERE date BETWEEN ? AND ?
    ORDER BY date ASC, expected_time ASC, source_unit ASC
  `).all(fromDate, toDate);
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function toLocalDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  getTrackedUnits,
  setTracked,
  getSlotsForDate,
  upsertLogEntry,
  getSummary,
  getRows,
  toLocalDateStr,
  // Exposed for testing
  _getDb: getDb,
};
