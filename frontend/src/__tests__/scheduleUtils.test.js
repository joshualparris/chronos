import { describe, it, expect } from 'vitest';
import { buildOnCalendar, buildRangeOnCalendar } from '../utils/api';

describe('schedule utilities', () => {
  it('builds exact half-hour range from 09:30 through 16:30', () => {
    const built = buildRangeOnCalendar({
      startTime: '09:30',
      endTime: '16:30',
      intervalMinutes: '30',
      dayMode: 'workdays',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    });

    expect(built.times).toEqual([
      '09:30','10:00','10:30','11:00','11:30','12:00',
      '12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30',
    ]);
    expect(built.schedule.split('\n')).toHaveLength(15);
    expect(built.schedule).toContain('Mon..Fri *-*-* 09:30:00');
    expect(built.schedule).not.toContain('09:00:00');
  });

  it('stops at the last interval inside an uneven range', () => {
    const built = buildRangeOnCalendar({
      startTime: '09:20',
      endTime: '10:30',
      intervalMinutes: '30',
      dayMode: 'everyday',
    });

    expect(built.times).toEqual(['09:20', '09:50', '10:20']);
  });

  it('does not regress the old every-N-minutes mode', () => {
    expect(buildOnCalendar('interval', { every: '30', unit: 'minutes' }))
      .toBe('*-*-* *:00/30:00');
  });
});
