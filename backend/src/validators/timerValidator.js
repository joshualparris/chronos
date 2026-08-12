/**
 * validators/timerValidator.js
 *
 * All validation logic lives here. Principle: reject early with a clear
 * error message rather than trying to sanitise. Sanitisation is also
 * applied at unit-file write time (see systemdService.js) as defence-in-depth.
 */

'use strict';

/**
 * Timer name: letters, digits, hyphens only; 1-48 chars.
 * The backend prefixes with "custom-" so the resulting unit name stays ≤ 56 chars
 * (systemd limit is 256 but we keep it human-friendly).
 */
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

/**
 * Fully-qualified custom unit name (as stored on disk / returned by systemctl).
 * Must start with "custom-" to prevent touching non-Chronos units.
 */
const UNIT_NAME_RE = /^custom-[a-z0-9][a-z0-9-]{0,47}\.timer$/;

/**
 * Category tag: simple word, no injection surface.
 */
const CATEGORY_RE = /^[a-z0-9-]{1,32}$/;

/**
 * Validate a raw timer name supplied by the user (before "custom-" prefix).
 */
function validateName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return {
      valid: false,
      error:
        'Name must be 1–48 lowercase letters, digits or hyphens and must start with a letter or digit.',
      code: 'INVALID_NAME',
    };
  }
  return { valid: true };
}

/**
 * Validate a unit-file name coming from a URL param (:name).
 * Must match "custom-*.timer" exactly.
 */
function validateUnitName(unitName) {
  if (typeof unitName !== 'string' || !UNIT_NAME_RE.test(unitName)) {
    return {
      valid: false,
      error:
        'Invalid timer name. Only Chronos-created timers (custom-*.timer) may be modified.',
      code: 'INVALID_UNIT_NAME',
    };
  }
  return { valid: true };
}

/**
 * Validate a systemd OnCalendar expression.
 * Strategy: shell out to `systemd-analyze calendar` (no user input reaches the shell —
 * we use execFile with an argument array). Reject if exit code is non-zero.
 * This is the only authoritative validator for the OnCalendar grammar.
 */
async function validateSchedule(schedule, execFileAsync) {
  if (typeof schedule !== 'string' || schedule.trim().length === 0 || schedule.length > 2000) {
    return {
      valid: false,
      error: 'Schedule must be a non-empty string (≤2000 chars).',
      code: 'INVALID_SCHEDULE',
    };
  }

  const specs = schedule.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (specs.length === 0 || specs.some(s => s.includes('=') || s.length > 200)) {
    return {
      valid: false,
      error: 'Schedule contains an invalid OnCalendar line.',
      code: 'INVALID_SCHEDULE',
    };
  }

  try {
    // execFile with array args — schedule is never interpolated into a shell string
    for (const spec of specs) {
      await execFileAsync('systemd-analyze', ['calendar', spec]);
    }
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Invalid OnCalendar expression: ${err.stderr || err.message}`,
      code: 'INVALID_SCHEDULE',
    };
  }
}

/**
 * Validate a user-visible message / description.
 * We accept any printable Unicode, but cap length and strip control characters.
 * The message is written into the unit file as a systemd Environment= variable
 * and passed to notify-send via execFile argv — so shell injection is structurally
 * impossible regardless, but we still reject obviously malicious-length strings.
 */
function validateMessage(message) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    return { valid: false, error: 'Message must be a non-empty string.', code: 'INVALID_MESSAGE' };
  }
  if (message.length > 500) {
    return { valid: false, error: 'Message must be ≤500 characters.', code: 'INVALID_MESSAGE' };
  }
  // Strip ASCII control chars (but allow tab/newline for display purposes — notify-send handles them fine)
  const cleaned = message.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  return { valid: true, cleaned };
}

/**
 * Validate optional category tag.
 */
function validateCategory(category) {
  if (!category) return { valid: true, cleaned: 'general' };
  if (!CATEGORY_RE.test(category)) {
    return {
      valid: false,
      error: 'Category must be 1–32 lowercase letters, digits or hyphens.',
      code: 'INVALID_CATEGORY',
    };
  }
  return { valid: true, cleaned: category };
}

module.exports = {
  validateName,
  validateUnitName,
  validateSchedule,
  validateMessage,
  validateCategory,
};
