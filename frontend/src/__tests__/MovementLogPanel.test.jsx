import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovementLogPanel } from '../components/MovementLogPanel';
import { api } from '../utils/api';

vi.mock('../utils/api', () => ({
  api: {
    getDaySlots: vi.fn(),
    logSlot: vi.fn(),
    getSummary: vi.fn(),
  },
}));

describe('MovementLogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDaySlots.mockResolvedValue({
      date: '2026-08-12',
      trackedUnits: ['movebreak.timer'],
      slots: [
        { time: '09:30', sourceUnit: 'movebreak.timer', status: 'unlogged', reason: null },
        { time: '10:00', sourceUnit: 'movebreak.timer', status: 'missed', reason: 'meeting' },
        { time: '10:30', sourceUnit: 'movebreak.timer', status: 'pending', reason: null },
      ],
    });
    api.logSlot.mockResolvedValue({ success: true });
  });

  it('renders slots and allows status/reason transitions', async () => {
    render(<MovementLogPanel onToast={vi.fn()} />);

    expect(await screen.findByText('09:30')).toBeTruthy();
    expect(screen.getByText('10:00')).toBeTruthy();
    expect(screen.getByText('Unlogged')).toBeTruthy();
    expect(screen.getByText('Missed')).toBeTruthy();
    expect(screen.getByText('"meeting"')).toBeTruthy();

    await userEvent.click(screen.getAllByTitle('Log with reason')[0]);
    const reason = await screen.findByPlaceholderText(/reason/i);
    await userEvent.type(reason, 'forgot');
    await userEvent.click(screen.getByRole('button', { name: /skipped/i }));

    await waitFor(() => {
      expect(api.logSlot).toHaveBeenCalledWith(
        expect.any(String),
        '09:30',
        {
          sourceUnit: 'movebreak.timer',
          status: 'skipped',
          reason: 'forgot',
        }
      );
    });
  });
});
