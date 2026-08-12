// src/__tests__/TimerForm.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimerForm } from '../components/TimerForm';

// Minimal mock for ScheduleBuilder so we don't need the full component
vi.mock('../components/ScheduleBuilder', () => ({
  ScheduleBuilder: ({ value, onChange }) => (
    <input
      data-testid="schedule-input"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  ),
}));

describe('TimerForm — create mode', () => {
  let onSubmit;
  let onCancel;

  beforeEach(() => {
    onSubmit = vi.fn();
    onCancel = vi.fn();
  });

  function renderForm(props = {}) {
    return render(
      <TimerForm
        editingTimer={null}
        onSubmit={onSubmit}
        onCancel={onCancel}
        isSubmitting={false}
        {...props}
      />
    );
  }

  it('renders the create heading', () => {
    renderForm();
    expect(screen.getByText(/Create System Timer/i)).toBeTruthy();
  });

  it('submit button is disabled when name is empty', () => {
    renderForm();
    const btn = screen.getByRole('button', { name: /create timer/i });
    expect(btn.disabled).toBe(true);
  });

  it('submit button is disabled when isSubmitting is true', () => {
    renderForm({ isSubmitting: true });
    const btn = screen.getByRole('button', { name: /creating/i });
    expect(btn.disabled).toBe(true);
  });

  it('shows validation error for invalid name', async () => {
    renderForm();
    const nameInput = screen.getByPlaceholderText(/e\.g\. hydrate/i);
    await userEvent.type(nameInput, 'INVALID_NAME!');
    // Error should appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create timer/i }).disabled).toBe(true);
    });
  });

  it('calls onSubmit with correct data for valid input', async () => {
    renderForm();
    const nameInput = screen.getByPlaceholderText(/e\.g\. hydrate/i);
    const messageInput = screen.getByPlaceholderText(/time to stand up/i);

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'hydrate');
    await userEvent.type(messageInput, 'Drink water!');

    // Set a schedule via the mocked input
    fireEvent.change(screen.getByTestId('schedule-input'), {
      target: { value: 'Mon-Fri *-*-* 09:00:00' },
    });

    const submitBtn = screen.getByRole('button', { name: /create timer/i });
    await userEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'hydrate', message: 'Drink water!' })
    );
  });
});

describe('TimerForm — edit mode', () => {
  it('renders edit heading and disables name field', () => {
    render(
      <TimerForm
        editingTimer={{ unit: 'custom-hydrate.timer', category: 'health', schedule: 'Mon-Fri *-*-* 09:00:00' }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isSubmitting={false}
      />
    );
    expect(screen.getByText(/Edit Timer/i)).toBeTruthy();
    const nameInput = screen.getByPlaceholderText(/e\.g\. hydrate/i);
    expect(nameInput.disabled).toBe(true);
  });
});
