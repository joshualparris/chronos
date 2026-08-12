'use strict';

/**
 * tests/movementLog.test.js
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Use a temp directory so tests don't touch real data
const TEST_DATA_DIR = path.join(os.tmpdir(), `chronos-test-${Date.now()}`);
process.env.CHRONOS_DATA_DIR = TEST_DATA_DIR;
process.env.CHRONOS_SYSTEMD_DIR = '/tmp/chronos-test-units';

const {
  getTrackedUnits,
  setTracked,
  getSlotsForDate,
  upsertLogEntry,
  getSummary,
  toLocalDateStr,
} = require('../src/services/movementLogService');

const { computeSlotsForDate } = require('../src/services/systemdService');

// ── toLocalDateStr ────────────────────────────────────────────────────────────
describe('toLocalDateStr', () => {
  it('formats today as YYYY-MM-DD', () => {
    const s = toLocalDateStr();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('formats a specific date', () => {
    expect(toLocalDateStr(new Date(2026, 7, 12))).toBe('2026-08-12');
  });
});

// ── Tracked timer config ──────────────────────────────────────────────────────
describe('tracked timers', () => {
  beforeEach(() => {
    // Reset tracked.json
    const p = path.join(TEST_DATA_DIR, 'tracked.json');
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it('starts empty', () => {
    expect(getTrackedUnits()).toEqual([]);
  });

  it('adds a tracked unit', () => {
    setTracked('movebreak.timer', true);
    expect(getTrackedUnits()).toContain('movebreak.timer');
  });

  it('removes a tracked unit', () => {
    setTracked('movebreak.timer', true);
    setTracked('movebreak.timer', false);
    expect(getTrackedUnits()).not.toContain('movebreak.timer');
  });

  it('tracks multiple units', () => {
    setTracked('movebreak.timer', true);
    setTracked('custom-hydrate.timer', true);
    const units = getTrackedUnits();
    expect(units).toContain('movebreak.timer');
    expect(units).toContain('custom-hydrate.timer');
  });
});

// ── upsertLogEntry ────────────────────────────────────────────────────────────
describe('upsertLogEntry', () => {
  it('inserts a new entry', () => {
    upsertLogEntry({ date: '2026-08-12', expectedTime: '09:30', sourceUnit: 'movebreak.timer', status: 'done' });
    const db = require('../src/services/movementLogService')._getDb();
    const row = db.prepare("SELECT * FROM movement_log WHERE date='2026-08-12' AND expected_time='09:30'").get();
    expect(row.status).toBe('done');
  });

  it('updates an existing entry (upsert)', () => {
    upsertLogEntry({ date: '2026-08-12', expectedTime: '10:00', sourceUnit: 'movebreak.timer', status: 'done' });
    upsertLogEntry({ date: '2026-08-12', expectedTime: '10:00', sourceUnit: 'movebreak.timer', status: 'missed', reason: 'in a meeting' });
    const db = require('../src/services/movementLogService')._getDb();
    const row = db.prepare("SELECT * FROM movement_log WHERE date='2026-08-12' AND expected_time='10:00'").get();
    expect(row.status).toBe('missed');
    expect(row.reason).toBe('in a meeting');
  });

  it('throws on invalid status', () => {
    expect(() => upsertLogEntry({
      date: '2026-08-12', expectedTime: '11:00', sourceUnit: 'movebreak.timer', status: 'bad-status',
    })).toThrow();
  });
});

// ── getSlotsForDate ───────────────────────────────────────────────────────────
describe('getSlotsForDate', () => {
  // Realistic 15-slot day: 09:30–16:30 every 30 min (Mon-Fri *-*-* 09:30..16:30)
  const FULL_DAY_SLOTS = [
    '09:30','10:00','10:30','11:00','11:30','12:00',
    '12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30',
  ];
  const mockCompute = jest.fn().mockImplementation(async (_cal, dateStr) => {
    if (dateStr === '2026-08-12') return FULL_DAY_SLOTS;
    return [];
  });

  it('returns pending slots for today (future times)', async () => {
    const slots = await getSlotsForDate('2026-08-12', mockCompute, {
      'movebreak.timer': 'Mon-Fri *-*-* 09:30..16:30:00/30:00',
    });
    expect(slots.length).toBe(15);
    expect(slots.every(s => s.sourceUnit === 'movebreak.timer')).toBe(true);
  });

  it('marks past slots on old dates as unlogged if no entry exists', async () => {
    const slots = await getSlotsForDate('2020-01-01', mockCompute, {
      'movebreak.timer': 'Mon-Fri *-*-* 09..10:00/30:00',
    });
    // 2020-01-01 is not in mockCompute's known dates, so returns []
    expect(slots.length).toBe(0);
  });

  it('merges DB entries with computed slots', async () => {
    upsertLogEntry({ date: '2026-08-12', expectedTime: '09:30', sourceUnit: 'movebreak.timer', status: 'done' });

    const slots = await getSlotsForDate('2026-08-12', mockCompute, {
      'movebreak.timer': 'Mon-Fri *-*-* 09:30..16:30:00/30:00',
    });
    const done = slots.find(s => s.time === '09:30');
    expect(done.status).toBe('done');
  });

  it('returns empty when no tracked timers', async () => {
    const slots = await getSlotsForDate('2026-08-12', mockCompute, {});
    expect(slots.length).toBe(0);
  });
});

// ── getSummary ────────────────────────────────────────────────────────────────
describe('getSummary', () => {
  beforeAll(() => {
    // Seed some data
    upsertLogEntry({ date: '2026-08-10', expectedTime: '09:00', sourceUnit: 'movebreak.timer', status: 'done' });
    upsertLogEntry({ date: '2026-08-10', expectedTime: '09:30', sourceUnit: 'movebreak.timer', status: 'missed', reason: 'in a meeting' });
    upsertLogEntry({ date: '2026-08-11', expectedTime: '09:00', sourceUnit: 'movebreak.timer', status: 'done' });
    upsertLogEntry({ date: '2026-08-11', expectedTime: '09:30', sourceUnit: 'movebreak.timer', status: 'done' });
  });

  it('returns per-day counts', () => {
    const { daily } = getSummary('2026-08-10', '2026-08-11');
    expect(daily.length).toBeGreaterThanOrEqual(2);
    const aug10 = daily.find(d => d.date === '2026-08-10');
    expect(aug10.done).toBe(1);
    expect(aug10.missed).toBe(1);
  });

  it('returns top reasons', () => {
    const { reasons } = getSummary('2026-08-10', '2026-08-11');
    expect(reasons.some(r => r.reason === 'in a meeting')).toBe(true);
  });

  it('returns totals', () => {
    const { totals } = getSummary('2026-08-10', '2026-08-11');
    expect(totals.done).toBeGreaterThanOrEqual(3);
    expect(totals.missed).toBeGreaterThanOrEqual(1);
  });

  it('counts lazily materialized unlogged rows for past slots', async () => {
    const mockCompute = jest.fn().mockResolvedValue(['09:30', '10:00', '10:30']);

    upsertLogEntry({
      date: '2026-08-03',
      expectedTime: '09:30',
      sourceUnit: 'movebreak.timer',
      status: 'done',
    });

    await getSlotsForDate('2026-08-03', mockCompute, {
      'movebreak.timer': 'Mon..Fri *-*-* 09,10:30:00',
    });

    const { daily, totals } = getSummary('2026-08-03', '2026-08-03');
    const day = daily.find(d => d.date === '2026-08-03');

    expect(day.done).toBe(1);
    expect(day.unlogged).toBe(2);
    expect(day.total).toBe(3);
    expect(totals.unlogged).toBe(2);
  });
});

// ── computeSlotsForDate ──────────────────────────────────────────────────────
describe('computeSlotsForDate', () => {
  const maybeIt = (() => {
    try {
      execFileSync('systemd-analyze', ['--version'], { stdio: 'ignore' });
      return it;
    } catch {
      return it.skip;
    }
  })();

  maybeIt('uses systemd-analyze base-time to derive slots for the requested date', async () => {
    const slots = await computeSlotsForDate(
      'Mon..Fri *-*-* 09..16:00/30',
      '2026-08-12',
      20
    );

    expect(slots).toEqual([
      '09:00','09:30','10:00','10:30','11:00','11:30',
      '12:00','12:30','13:00','13:30','14:00','14:30',
      '15:00','15:30','16:00','16:30',
    ]);
  });
});
