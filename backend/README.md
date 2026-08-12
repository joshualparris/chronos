# Chronos Backend

Local-only Node.js + Express server that wraps `systemctl --user` to manage systemd timer units that fire desktop notifications via `notify-send`.

## Requirements

- Linux (Fedora, Ubuntu, etc.) with **systemd** (user services must be available — tested on systemd ≥ 248)
- Node.js ≥ 18
- `notify-send` installed (`libnotify` on most distros)

> **macOS / Windows:** The backend will start but all systemd calls will fail. The frontend health-check will surface a warning banner.

## Setup

```bash
cd backend
cp .env.example .env      # review and edit if needed
npm install
```

## Native SQLite dependency

The Movement Log uses SQLite via `better-sqlite3`, which is a native Node addon. `npm install` builds or installs a binding for the current Node version, OS, and CPU architecture. If you move `node_modules` to another machine, change Node versions, or restore an old dependency folder, it may fail with a cryptic `NODE_MODULE_VERSION` mismatch or native binding error.

Fix it with:

```bash
npm rebuild better-sqlite3
# or, for a clean rebuild:
rm -rf node_modules
npm install
```

Your movement data is separate from `node_modules`. By default it lives at `~/.chronos/movement-log.db`; set `CHRONOS_DATA_DIR` to move it elsewhere.

## Running

```bash
npm start           # production
npm run dev         # with --watch auto-reload
```

## Environment variables (`.env`)

| Variable              | Default                         | Description                                    |
|-----------------------|---------------------------------|------------------------------------------------|
| `PORT`                | `3001`                          | Port the backend listens on                    |
| `CHRONOS_SYSTEMD_DIR` | `~/.config/systemd/user`        | Override the systemd unit file directory       |
| `ALLOWED_ORIGIN`      | `http://localhost:5173`         | CORS: which frontend origin is allowed         |

## Running tests

```bash
npm test
```

39 tests across two suites:
- `tests/validator.test.js` — unit tests for all validators, including the full injection-payload checklist
- `tests/routes.test.js` — integration tests for all Express routes (systemd fully mocked)

## API

| Method   | Route                              | Description                              |
|----------|------------------------------------|------------------------------------------|
| GET      | `/api/health`                      | Confirm systemd availability             |
| GET      | `/api/system-timers`               | List all user timers                     |
| POST     | `/api/system-timers`               | Create a new Chronos timer               |
| PATCH    | `/api/system-timers/:name`         | Update an existing Chronos timer         |
| DELETE   | `/api/system-timers/:name`         | Delete a Chronos timer                   |
| PATCH    | `/api/system-timers/:name/pause`   | Stop (pause) a timer without disabling   |
| PATCH    | `/api/system-timers/:name/resume`  | Restart a paused timer                   |
| GET      | `/api/system-timers/:name/history` | Recent journal entries for a timer       |
| GET      | `/api/movement-log/export`         | Export movement log rows as CSV or JSON  |

`:name` must match `custom-[a-z0-9-]+.timer` exactly — non-custom units are rejected.

## Security notes

- All `exec` calls use `execFile` with an explicit argv array — no user input is ever interpolated into a shell command string.
- `schedule` is validated against the systemd `OnCalendar=` grammar via `systemd-analyze calendar` before being written anywhere.
- Messages are stored in `Environment=` variables in the unit file and passed to `notify-send` via execFile argv — no shell expansion occurs at timer-fire time.
- The unit name allowlist (`^custom-[a-z0-9-]+\.timer$`) prevents path traversal and touching non-Chronos units.
