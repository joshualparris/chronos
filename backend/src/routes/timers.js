/**
 * routes/timers.js
 *
 * All routes are thin: validate → service → respond.
 * No business logic or shell interaction here.
 */

'use strict';

const express = require('express');
const router = express.Router();
const util = require('util');
const { execFile } = require('child_process');
const execFileAsync = util.promisify(execFile);

const systemd = require('../services/systemdService');
const {
  validateName,
  validateUnitName,
  validateSchedule,
  validateMessage,
  validateCategory,
} = require('../validators/timerValidator');

/** Consistent error response helper */
function fail(res, status, message, code) {
  return res.status(status).json({ error: message, code: code || 'ERROR' });
}

// ── GET /api/system-timers ────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const timers = await systemd.listTimers();
    return res.json(timers);
  } catch (err) {
    console.error('[timers] listTimers error:', err);
    return fail(res, 500, 'Failed to list timers.', 'SYSTEMD_ERROR');
  }
});

// ── GET /api/system-timers/:name/history ─────────────────────────────────────
router.get('/:name/history', async (req, res) => {
  const validation = validateUnitName(req.params.name);
  if (!validation.valid) return fail(res, 400, validation.error, validation.code);

  try {
    const history = await systemd.getUnitHistory(req.params.name);
    return res.json({ history });
  } catch (err) {
    return fail(res, 500, 'Failed to fetch history.', 'SYSTEMD_ERROR');
  }
});

// ── POST /api/system-timers ───────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, schedule, message, description, category } = req.body || {};

  // 1. Validate name
  const nameResult = validateName(name);
  if (!nameResult.valid) return fail(res, 400, nameResult.error, nameResult.code);

  // 2. Validate message
  const msgResult = validateMessage(message);
  if (!msgResult.valid) return fail(res, 400, msgResult.error, msgResult.code);

  // 3. Validate description (optional, use message as fallback)
  const descResult = validateMessage(description || message);
  if (!descResult.valid) return fail(res, 400, descResult.error, descResult.code);

  // 4. Validate category
  const catResult = validateCategory(category);
  if (!catResult.valid) return fail(res, 400, catResult.error, catResult.code);

  // 5. Validate schedule — this shells out to systemd-analyze using execFile
  const schedResult = await validateSchedule(schedule, execFileAsync);
  if (!schedResult.valid) return fail(res, 400, schedResult.error, schedResult.code);

  const safeName = 'custom-' + name.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  try {
    await systemd.createTimer({
      safeName,
      schedule,
      message: msgResult.cleaned,
      description: descResult.cleaned,
      category: catResult.cleaned,
    });
    return res.status(201).json({ success: true, name: `${safeName}.timer` });
  } catch (err) {
    console.error('[timers] createTimer error:', err);
    return fail(res, 500, `Failed to create timer: ${err.message}`, 'SYSTEMD_ERROR');
  }
});

// ── PATCH /api/system-timers/:name ───────────────────────────────────────────
router.patch('/:name', async (req, res) => {
  const unitValidation = validateUnitName(req.params.name);
  if (!unitValidation.valid) return fail(res, 400, unitValidation.error, unitValidation.code);

  const { schedule, message, description, category } = req.body || {};

  const msgResult = validateMessage(message);
  if (!msgResult.valid) return fail(res, 400, msgResult.error, msgResult.code);

  const descResult = validateMessage(description || message);
  if (!descResult.valid) return fail(res, 400, descResult.error, descResult.code);

  const catResult = validateCategory(category);
  if (!catResult.valid) return fail(res, 400, catResult.error, catResult.code);

  const schedResult = await validateSchedule(schedule, execFileAsync);
  if (!schedResult.valid) return fail(res, 400, schedResult.error, schedResult.code);

  const safeName = req.params.name.replace(/\.timer$/, '');

  try {
    await systemd.updateTimer({
      safeName,
      schedule,
      message: msgResult.cleaned,
      description: descResult.cleaned,
      category: catResult.cleaned,
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('[timers] updateTimer error:', err);
    return fail(res, 500, `Failed to update timer: ${err.message}`, 'SYSTEMD_ERROR');
  }
});

// ── PATCH /api/system-timers/:name/pause ─────────────────────────────────────
router.patch('/:name/pause', async (req, res) => {
  const validation = validateUnitName(req.params.name);
  if (!validation.valid) return fail(res, 400, validation.error, validation.code);

  try {
    await systemd.pauseTimer(req.params.name);
    return res.json({ success: true, state: 'paused' });
  } catch (err) {
    return fail(res, 500, `Failed to pause timer: ${err.message}`, 'SYSTEMD_ERROR');
  }
});

// ── PATCH /api/system-timers/:name/resume ────────────────────────────────────
router.patch('/:name/resume', async (req, res) => {
  const validation = validateUnitName(req.params.name);
  if (!validation.valid) return fail(res, 400, validation.error, validation.code);

  try {
    await systemd.resumeTimer(req.params.name);
    return res.json({ success: true, state: 'running' });
  } catch (err) {
    return fail(res, 500, `Failed to resume timer: ${err.message}`, 'SYSTEMD_ERROR');
  }
});

// ── DELETE /api/system-timers/:name ──────────────────────────────────────────
router.delete('/:name', async (req, res) => {
  const validation = validateUnitName(req.params.name);
  if (!validation.valid) return fail(res, 400, validation.error, validation.code);

  try {
    await systemd.deleteTimer(req.params.name);
    return res.json({ success: true });
  } catch (err) {
    console.error('[timers] deleteTimer error:', err);
    return fail(res, 500, `Failed to delete timer: ${err.message}`, 'SYSTEMD_ERROR');
  }
});

module.exports = router;
