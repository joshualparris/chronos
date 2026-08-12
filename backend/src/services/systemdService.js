/**
 * services/systemdService.js — healthCheck() overhaul
 *
 * Captures precise failure reasons rather than a generic boolean.
 * Possible outcomes:
 *   { available: true, state: 'running'|'degraded' }
 *   { available: false, reason: string, detail?: string, isLikelySandbox?: boolean }
 */

'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const os = require('os');

const execFileAsync = util.promisify(execFile);

module.exports.execFileAsync = execFileAsync;

const SYSTEMD_DIR =
  process.env.CHRONOS_SYSTEMD_DIR ||
  path.join(os.homedir(), '.config', 'systemd', 'user');
const NOTIFY_HELPER = path.resolve(__dirname, '../../scripts/chronos-notify.js');

function safeUnitPath(filename) {
  const resolved = path.resolve(SYSTEMD_DIR, filename);
  if (!resolved.startsWith(path.resolve(SYSTEMD_DIR) + path.sep)) {
    throw new Error(`Path traversal attempt: ${filename}`);
  }
  return resolved;
}

async function systemctl(...args) {
  return execFileAsync('systemctl', ['--user', ...args]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLikelySandbox() {
  // Container / restricted env heuristics
  try {
    if (fs.existsSync('/.dockerenv')) return true;
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    if (/docker|lxc|kubepods|buildkit/.test(cgroup)) return true;
  } catch {}
  return false;
}

function sanitiseStderr(raw = '') {
  // Truncate to 300 chars; strip any potential escape sequences
  return raw.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 300).trim();
}

// ── Health check ──────────────────────────────────────────────────────────────

async function healthCheck() {
  const sandbox = isLikelySandbox();

  // 1. Is systemctl on PATH?
  try {
    await execFileAsync('which', ['systemctl'], { timeout: 2000 });
  } catch {
    return {
      available: false,
      reason: 'systemctl not found on PATH — is systemd installed?',
      isLikelySandbox: sandbox,
    };
  }

  // 2. Is XDG_RUNTIME_DIR set and accessible?
  const xdgDir = process.env.XDG_RUNTIME_DIR;
  if (!xdgDir) {
    return {
      available: false,
      reason: 'XDG_RUNTIME_DIR is not set — the backend process may not have a login session.',
      detail: 'Try starting the backend from a full desktop session, or set XDG_RUNTIME_DIR=/run/user/$(id -u) in your .env.',
      isLikelySandbox: sandbox,
    };
  }
  if (!fs.existsSync(xdgDir)) {
    return {
      available: false,
      reason: `XDG_RUNTIME_DIR points to "${xdgDir}" which does not exist.`,
      detail: 'This usually means the user session has not fully initialised. Run: loginctl enable-linger $USER',
      isLikelySandbox: sandbox,
    };
  }

  // 3. Is D-Bus session bus available?
  const dbus = process.env.DBUS_SESSION_BUS_ADDRESS;
  if (!dbus) {
    const detail = sandbox
      ? 'This process appears to be running inside a container/sandbox where D-Bus is typically unavailable.'
      : 'Set DBUS_SESSION_BUS_ADDRESS in the backend .env, or start the backend from a full desktop session.';
    return {
      available: false,
      reason: 'DBUS_SESSION_BUS_ADDRESS is not set — cannot connect to the systemd user instance.',
      detail,
      isLikelySandbox: sandbox,
    };
  }

  // 4. Try systemctl --user is-system-running
  //    Exit codes: 0=running, 1=degraded, 2=maintenance, 3=initialising, 4=offline
  //    "degraded" (exit 1) means user instance IS running but ≥1 unit failed — still usable.
  try {
    const { stdout } = await execFileAsync('systemctl', ['--user', 'is-system-running'], {
      timeout: 4000,
    });
    const state = stdout.trim();
    // Any of these mean the user instance is up and we can talk to it
    if (['running', 'degraded', 'stopping', 'maintenance'].includes(state)) {
      if (state === 'degraded') {
        // Identify the failed unit for a more helpful message
        return degradedHealthDetail();
      }
      return { available: true, state };
    }
    // Unexpected state
    return {
      available: false,
      reason: `systemd user instance reported state: "${state}".`,
      detail: 'Run `systemctl --user status` to investigate.',
      isLikelySandbox: sandbox,
    };
  } catch (err) {
    const stderr = sanitiseStderr(err.stderr || '');
    const stdout = (err.stdout || '').trim();

    // If stdout has a known state, it still works despite non-zero exit
    if (stdout === 'running') {
      return { available: true, state: stdout };
    }
    if (stdout === 'degraded') return degradedHealthDetail();

    // Connection refused / no such socket → user instance not running
    if (stderr.includes('Connection refused') || stderr.includes('No such file or directory')) {
      return {
        available: false,
        reason: 'Cannot connect to the systemd user instance — it may not be running.',
        detail: sandbox
          ? 'Container/sandbox environments do not typically have a systemd user instance.'
          : `D-Bus error: ${stderr.slice(0, 150)}. Try: systemctl --user start user@$(id -u).service`,
        isLikelySandbox: sandbox,
      };
    }

    console.error('[chronos:health] systemctl --user is-system-running failed:', err.message, '| stderr:', stderr);
    return {
      available: false,
      reason: 'Failed to query the systemd user instance.',
      detail: stderr || err.message,
      isLikelySandbox: sandbox,
    };
  }
}

async function degradedHealthDetail() {
  let failedUnits = '';
  try {
    const { stdout } = await execFileAsync('systemctl', [
      '--user', '--failed', '--no-pager', '--plain', '--no-legend',
    ], { timeout: 2000 });
    failedUnits = stdout.split('\n').filter(Boolean).map(l => l.split(/\s+/)[0]).join(', ');
  } catch {}
  return {
    available: true,
    state: 'degraded',
    detail: failedUnits
      ? `The user session is in degraded state — failed units: ${failedUnits}. Chronos timers still work.`
      : 'The user session is in degraded state. Chronos timers still work.',
  };
}

// ── Timer listing ─────────────────────────────────────────────────────────────

async function listTimers() {
  try {
    const { stdout } = await execFileAsync('systemctl', [
      '--user', 'list-timers', '--all', '--no-pager', '--output=json',
    ]);
    const raw = JSON.parse(stdout);
    return raw.map(normaliseJsonTimer);
  } catch (err) {
    console.warn('[chronos] systemctl JSON output failed, falling back to text parser:', err.message);
    return listTimersText();
  }
}

function normaliseJsonTimer(t) {
  const nowUs = Date.now() * 1000;
  const nextUs = t.next > 0 ? t.next : null;
  const leftUs = nextUs ? nextUs - nowUs : null;
  const lastUs = t.last > 0 ? t.last : null;

  return {
    id: t.unit,
    unit: t.unit,
    activates: t.activates,
    nextTimestamp: nextUs ? Math.floor(nextUs / 1000) : null,
    nextRelative: leftUs ? formatRelative(leftUs / 1000) : 'n/a',
    lastTimestamp: lastUs ? Math.floor(lastUs / 1000) : null,
    isCustom: t.unit.startsWith('custom-'),
    isTracked: false, // populated from metadata file by routes layer
  };
}

async function listTimersText() {
  const { stdout } = await execFileAsync('systemctl', [
    '--user', 'list-timers', '--all', '--no-pager',
  ]);
  const lines = stdout.split('\n');
  const timers = [];
  let parsing = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('NEXT')) { parsing = true; continue; }
    if (parsing && line === '') break;
    if (!parsing) continue;

    const parts = line.split(/\s+/);
    const unit = parts.find(p => p.endsWith('.timer'));
    const activates = parts.find(p => p.endsWith('.service'));
    if (!unit) continue;

    timers.push({
      id: unit, unit, activates,
      nextTimestamp: null, nextRelative: 'n/a (text fallback)', lastTimestamp: null,
      isCustom: unit.startsWith('custom-'), isTracked: false,
    });
  }
  return timers;
}

function formatRelative(ms) {
  if (ms < 0) return 'overdue';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

async function getUnitHistory(unitName, lines = 20) {
  try {
    const { stdout } = await execFileAsync('journalctl', [
      '--user', '-u', unitName, '-n', String(lines),
      '--no-pager', '-o', 'short-iso',
    ]);
    return stdout.split('\n').filter(Boolean).map(l => l.trim());
  } catch {
    return [];
  }
}

/**
 * Use systemd-analyze calendar to compute occurrences of an OnCalendar expression
 * within a given date (local time). Returns array of "HH:MM" strings.
 * execFile args array — no user data in shell string.
 */
async function computeSlotsForDate(onCalendar, dateStr, maxIterations = 50) {
  // dateStr = "YYYY-MM-DD"
  const baseTime = `${dateStr} 00:00:00`;
  const specs = splitCalendarSpecs(onCalendar);

  try {
    const chunks = [];
    for (const spec of specs) {
      const { stdout } = await execFileAsync('systemd-analyze', [
        'calendar',
        '--base-time', baseTime,
        '--iterations', String(maxIterations),
        spec,
      ], { timeout: 5000 });
      chunks.push(stdout);
    }

    const slots = [];
    for (const line of chunks.join('\n').split('\n')) {
      // Lines look like:
      //   "    Next elapse: Wed 2026-08-12 09:00:00 AEST"
      //   "   Iteration #2: Wed 2026-08-12 09:30:00 AEST"
      const m = line.match(/(?:Next elapse|Iteration\s+#\d+):\s+\S+\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}):\d{2}/);
      if (!m) continue;
      const iterDate = m[1]; // YYYY-MM-DD
      const iterTime = m[2]; // HH:MM
      if (iterDate !== dateStr) continue;
      slots.push(iterTime);
    }
    return [...new Set(slots)].sort();
  } catch (err) {
    console.warn('[chronos] computeSlotsForDate failed:', err.message);
    return [];
  }
}

function splitCalendarSpecs(onCalendar) {
  return String(onCalendar || '')
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

async function createTimer({ safeName, schedule, message, description, category }) {
  if (!fs.existsSync(SYSTEMD_DIR)) {
    fs.mkdirSync(SYSTEMD_DIR, { recursive: true });
  }

  const serviceFile = safeUnitPath(`${safeName}.service`);
  const timerFile   = safeUnitPath(`${safeName}.timer`);

  const escapedMsg   = message.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  const escapedTitle = `Chronos: ${safeName}`.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  const timerUnit = `${safeName}.timer`;

  const serviceContent = [
    '[Unit]',
    `Description=${escapeUnitValue(description || 'Chronos alert')}`,
    `X-Chronos-Category=${escapeUnitValue(category || 'general')}`,
    '',
    '[Service]',
    'Type=oneshot',
    `Environment="CHRONOS_TITLE=${escapedTitle}"`,
    `Environment="CHRONOS_MSG=${escapedMsg}"`,
    `Environment="CHRONOS_TIMER_UNIT=${timerUnit}"`,
    `Environment="CHRONOS_FRONTEND_URL=${process.env.CHRONOS_FRONTEND_URL || 'http://127.0.0.1:5173'}"`,
    `ExecStart=${process.execPath} ${NOTIFY_HELPER}`,
  ].join('\n') + '\n';

  const timerContent = [
    '[Unit]',
    `Description=Chronos timer for ${escapeUnitValue(safeName)}`,
    '',
    '[Timer]',
    ...splitCalendarSpecs(schedule).map(spec => `OnCalendar=${spec}`),
    'Persistent=false',
    '',
    '[Install]',
    'WantedBy=timers.target',
  ].join('\n') + '\n';

  fs.writeFileSync(serviceFile, serviceContent, { mode: 0o600 });
  fs.writeFileSync(timerFile,   timerContent,   { mode: 0o600 });

  await systemctl('daemon-reload');
  await systemctl('enable', '--now', `${safeName}.timer`);
}

async function updateTimer({ safeName, schedule, message, description, category }) {
  await deleteTimer(`${safeName}.timer`);
  await createTimer({ safeName, schedule, message, description, category });
}

async function deleteTimer(unitName) {
  try { await systemctl('stop', unitName); }    catch {}
  try { await systemctl('disable', unitName); } catch {}

  const baseName    = unitName.replace(/\.timer$/, '');
  const timerFile   = safeUnitPath(unitName);
  const serviceFile = safeUnitPath(`${baseName}.service`);

  if (fs.existsSync(timerFile))   fs.unlinkSync(timerFile);
  if (fs.existsSync(serviceFile)) fs.unlinkSync(serviceFile);

  await systemctl('daemon-reload');
}

async function pauseTimer(unitName)  { await systemctl('stop',  unitName); }
async function resumeTimer(unitName) { await systemctl('start', unitName); }

function escapeUnitValue(val) {
  return String(val).replace(/\n/g, ' ').trim();
}

module.exports = {
  healthCheck,
  listTimers,
  createTimer,
  updateTimer,
  deleteTimer,
  pauseTimer,
  resumeTimer,
  getUnitHistory,
  computeSlotsForDate,
  splitCalendarSpecs,
  execFileAsync,
  formatRelative,
};
