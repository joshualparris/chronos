#!/usr/bin/env node
'use strict';

const { execFile } = require('child_process');
const util = require('util');
const path = require('path');

const execFileAsync = util.promisify(execFile);

const {
  getTrackedUnits,
  upsertLogEntry,
  toLocalDateStr,
} = require('../src/services/movementLogService');

const FRONTEND_URL = process.env.CHRONOS_FRONTEND_URL || 'http://127.0.0.1:5173';

function currentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function main() {
  const title = process.env.CHRONOS_TITLE || 'Chronos';
  const message = process.env.CHRONOS_MSG || 'Timer fired.';
  const unit = process.env.CHRONOS_TIMER_UNIT || '';
  const isTracked = unit && getTrackedUnits().includes(unit);

  if (!isTracked) {
    await execFileAsync('notify-send', ['-u', 'normal', '--', title, message]);
    return;
  }

  let stdout = '';
  try {
    const result = await execFileAsync('notify-send', [
      '-u', 'normal',
      '-A', 'done=Done',
      '-A', 'missed=Missed',
      '-A', 'open=Open Chronos',
      '--',
      title,
      `${message}\n\nLog this movement break:`,
    ], { timeout: 300000 });
    stdout = result.stdout.trim();
  } catch (err) {
    stdout = String(err.stdout || '').trim();
    if (!stdout) {
      await execFileAsync('xdg-open', [FRONTEND_URL]).catch(() => {});
      return;
    }
  }

  if (stdout === 'done' || stdout === 'missed') {
    upsertLogEntry({
      date: toLocalDateStr(),
      expectedTime: currentTimeStr(),
      sourceUnit: unit,
      status: stdout,
      reason: null,
    });
    return;
  }

  if (stdout === 'open' || stdout === 'default') {
    await execFileAsync('xdg-open', [`${FRONTEND_URL}?tab=movement`]).catch(() => {});
  }
}

main().catch((err) => {
  console.error('[chronos-notify]', err && err.stack ? err.stack : err);
  process.exit(1);
});
