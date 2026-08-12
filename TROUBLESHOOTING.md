/**
 * TROUBLESHOOTING.md — systemd user services
 */

# Chronos — systemd User Services Troubleshooting

Chronos uses **systemd user services** (i.e. `systemctl --user`) to create persistent timer notifications. This is a standard Linux feature on Fedora, Ubuntu, Arch, and most desktop distributions running systemd ≥ 232.

---

## Confirming it works

Open a terminal and run:

```bash
systemctl --user status
```

You should see something like:

```
● HOSTNAME
    State: running   # or "degraded" — both mean it's working
    Units: 237 loaded
    ...
```

A state of **`running`** or **`degraded`** means the user instance is up. `degraded` just means one or more units have failed (unrelated to Chronos) — Chronos timers will still work correctly.

---

## Common problems and fixes

### "systemctl not found"
systemd is not installed. On a normal Fedora/Ubuntu desktop this won't happen. If you're in a minimal container or NixOS, you may need to install systemd or use a different notification mechanism.

### "XDG_RUNTIME_DIR is not set" or doesn't exist
The backend process isn't running in a full login session. Options:

1. **Start the backend from a desktop terminal** rather than a headless SSH session without proper PAM setup.
2. **Set the variable manually** in `backend/.env`:
   ```
   XDG_RUNTIME_DIR=/run/user/1000    # replace 1000 with your UID
   DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
   ```
3. **Enable linger** so your user session starts at boot even without a login:
   ```bash
   sudo loginctl enable-linger $USER
   ```

### "DBUS_SESSION_BUS_ADDRESS is not set"
Same root cause as above — the process doesn't have a D-Bus session. Same fixes apply. You can also confirm what address your desktop session uses with:
```bash
echo $DBUS_SESSION_BUS_ADDRESS
# expected: unix:path=/run/user/1000/bus
```

### "Cannot connect to the systemd user instance"
The user instance isn't running. Try:
```bash
systemctl --user start user@$(id -u).service
# or just log out and back in
```

### Running over SSH / headless
SSH sessions don't get a systemd user session by default. Enable linger first:
```bash
sudo loginctl enable-linger $USER
```
Then when you SSH in, set the environment variables in `backend/.env` as shown above, or use `systemd-run --user` to start the backend inside the user session.

---

## Container / sandbox environments

Some development environments (Docker, GitHub Codespaces, certain CI systems) don't have a systemd user instance at all. The Chronos health check will detect this and display a warning — Quick Timers will still work, but System Alerts (which require `systemctl --user`) won't.

The health check response tells you exactly which check failed (`reason` field) so you can diagnose quickly without guessing.

---

## Verifying a normal desktop session vs. headless

```bash
# Desktop session — should show actual socket path
echo $DBUS_SESSION_BUS_ADDRESS
# unix:path=/run/user/1000/bus

# Headless/SSH without linger — typically empty or missing
echo $DBUS_SESSION_BUS_ADDRESS
# (empty)

# Check user instance state
systemctl --user is-system-running
# running  → fully working
# degraded → working, some units failed (check: systemctl --user --failed)
# offline  → not running
```
