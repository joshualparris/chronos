# Chronos Frontend

React 19 + Vite single-page app for managing systemd timers and quick in-browser countdowns.

## Requirements

- Node.js ≥ 18
- The Chronos backend running (see `../backend/README.md`)

## Setup

```bash
cd frontend
cp .env.example .env.local     # edit VITE_API_BASE if backend is on a different port
npm install
```

## Running

```bash
npm run dev      # dev server at http://localhost:5173
npm run build    # production build
npm run test     # Vitest component tests
npm run lint     # oxlint
```

## Environment variables (`.env.local`)

| Variable        | Default                       | Description               |
|-----------------|-------------------------------|---------------------------|
| `VITE_API_BASE` | `http://localhost:3001/api`   | Backend API base URL      |

## Features

### System Alerts tab
- Lists all systemd user timers with next-trigger time (JSON output from systemd ≥ 248, text fallback for older)
- Human-friendly schedule builder (interval / workdays / daily / specific days / raw OnCalendar)
- Create, edit, delete, pause/resume timers
- Category tags with colour coding (health / work / chores / personal / general)
- Search/filter by name or category
- Run history drawer (reads `journalctl --user -u <unit>`)
- Confirmation dialog before delete

### Quick Timers tab
- Preset buttons: 5 / 10 / 15 / 25 / 60 min
- Free entry for any duration
- Live countdown with progress bar
- Persisted to `localStorage` — survives page refresh
- Correct `clearTimeout` on cancel (no ghost notifications)
- Browser Notification API fires on expiry

### General
- Health-check on load — surfaces a warning banner if systemd user services aren't available
- Toast notifications for all create/update/delete/error actions
- Responsive layout down to mobile widths
- Loading state distinguishes "loading" from "no timers found"
