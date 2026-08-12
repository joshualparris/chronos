'use strict';

/**
 * tests/routes.test.js
 *
 * Integration tests for Express routes using supertest.
 * systemdService is fully mocked — no actual systemd calls.
 */

const request = require('supertest');

process.env.ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGINS,
  'https://frontend-seven-flame-gceb9izi76.vercel.app',
].filter(Boolean).join(',');

const app = require('../server');

// ── Mock the systemd service ──────────────────────────────────────────────────
jest.mock('../src/services/systemdService', () => ({
  healthCheck: jest.fn().mockResolvedValue({ available: true }),
  listTimers: jest.fn().mockResolvedValue([
    {
      id: 'movebreak.timer',
      unit: 'movebreak.timer',
      activates: 'movebreak.service',
      nextTimestamp: Date.now() + 1800000,
      nextRelative: '29m 59s',
      lastTimestamp: null,
      isCustom: false,
    },
  ]),
  createTimer: jest.fn().mockResolvedValue(undefined),
  updateTimer: jest.fn().mockResolvedValue(undefined),
  deleteTimer: jest.fn().mockResolvedValue(undefined),
  pauseTimer: jest.fn().mockResolvedValue(undefined),
  resumeTimer: jest.fn().mockResolvedValue(undefined),
  getUnitHistory: jest.fn().mockResolvedValue(['line1', 'line2']),
  execFileAsync: jest.fn(),
}));

// Mock validateSchedule to avoid shelling out
jest.mock('../src/validators/timerValidator', () => {
  const real = jest.requireActual('../src/validators/timerValidator');
  return {
    ...real,
    validateSchedule: jest.fn().mockImplementation(async (schedule) => {
      // Accept anything that looks like a real schedule
      if (!schedule || schedule.includes(';') || schedule.includes('`') || schedule.length > 200) {
        return { valid: false, error: 'Invalid schedule', code: 'INVALID_SCHEDULE' };
      }
      return { valid: true };
    }),
  };
});

// ── GET /api/health ───────────────────────────────────────────────────────────
describe('GET /api/health', () => {
  it('returns 200 when systemd available', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('allows browser requests from 127.0.0.1 Vite origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://127.0.0.1:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
  });

  it('allows browser private-network preflights from deployed frontend origin', async () => {
    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://frontend-seven-flame-gceb9izi76.vercel.app')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Private-Network', 'true');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://frontend-seven-flame-gceb9izi76.vercel.app');
    expect(res.headers['access-control-allow-private-network']).toBe('true');
  });
});

// ── GET /api/system-timers ────────────────────────────────────────────────────
describe('GET /api/system-timers', () => {
  it('returns timer list', async () => {
    const res = await request(app).get('/api/system-timers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].unit).toBe('movebreak.timer');
  });
});

// ── POST /api/system-timers ───────────────────────────────────────────────────
describe('POST /api/system-timers', () => {
  const valid = {
    name: 'hydrate',
    schedule: 'Mon-Fri *-*-* 09:00:00',
    message: 'Drink water!',
    category: 'health',
  };

  it('creates a timer with valid input', async () => {
    const res = await request(app).post('/api/system-timers').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  // Security: injection payloads must all be rejected
  const injectionCases = [
    ['name with semicolon', { ...valid, name: 'foo; touch /tmp/pwned' }],
    ['name with backtick', { ...valid, name: '`id`' }],
    ['name with dollar', { ...valid, name: '$(whoami)' }],
    ['name with path traversal', { ...valid, name: '../../etc/passwd' }],
    ['name with uppercase', { ...valid, name: 'FooBar' }],
    ['schedule injection', { ...valid, schedule: '"; touch /tmp/pwned #' }],
    ['schedule with backtick', { ...valid, schedule: '`id`' }],
    ['empty name', { ...valid, name: '' }],
    ['empty message', { ...valid, message: '' }],
    ['missing schedule', { ...valid, schedule: undefined }],
  ];

  for (const [label, payload] of injectionCases) {
    it(`rejects injection payload: ${label}`, async () => {
      const res = await request(app).post('/api/system-timers').send(payload);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.error).toBeDefined();
    });
  }
});

// ── DELETE /api/system-timers/:name ──────────────────────────────────────────
describe('DELETE /api/system-timers/:name', () => {
  it('deletes a valid custom timer', async () => {
    const res = await request(app).delete('/api/system-timers/custom-hydrate.timer');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  const dangerousNames = [
    'movebreak.timer',             // non-custom — should be blocked
    '../../etc/cron.d/evil.timer', // path traversal
    'custom-foo.timer; rm -rf ~',  // shell injection
    'custom-FOO.timer',            // uppercase
    'systemd-tmpfiles-clean.timer',
  ];

  for (const name of dangerousNames) {
    it(`rejects dangerous name: ${name}`, async () => {
      const res = await request(app)
        .delete(`/api/system-timers/${encodeURIComponent(name)}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  }
});

// ── GET /api/system-timers/:name/history ─────────────────────────────────────
describe('GET /api/system-timers/:name/history', () => {
  it('returns history for valid custom timer', async () => {
    const res = await request(app).get('/api/system-timers/custom-hydrate.timer/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
  });

  it('rejects non-custom timer names', async () => {
    const res = await request(app).get('/api/system-timers/movebreak.timer/history');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
