# DataBased — Project Handoff / Quick Start

A snapshot of the project's architecture, build flow, and pending work.
Drop this into a new chat or onboard a new contributor and they pick up
without losing context.

> Replace placeholders like `<pi-host>`, `<your-user>`, `<NAS>`, etc. with
> the actual values for your deployment.

---

## What it is

A centralized file-sync orchestrator for a lab (or any small fleet of
Windows machines). A Linux box (Raspberry Pi or x86 mini-PC) runs Flask +
SQLite + APScheduler as the orchestrator; Windows machines run a
PyInstaller agent (system tray app) that heartbeats, watches folders,
executes syncs, and pushes metrics. A React dashboard on the orchestrator
visualizes everything; an admin panel manages users, instrument types,
fleet ops, and per-device config.

---

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────┐
│  Linux orchestrator (Pi)    │         │  Windows lab PCs         │
│  ─────────────────────────  │         │  ──────────────────────  │
│  Flask + SQLite             │ ◄──────►│  databased-agent.exe     │
│  APScheduler                 │  HTTP  │  (tray icon)              │
│  Tinyproxy (optional)       │         │  watches source dirs      │
│  Guacamole (Docker)         │         │  pushes metrics           │
│  React dashboard            │         │  syncs to NAS             │
└──────────────┬──────────────┘         └──────────────┬───────────┘
               │                                        │
               └─────────────  \\<NAS>\Share  ──────────┘
```

- Orchestrator lives in `/home/<your-user>/databased` (or wherever you
  cloned). Hostname is whatever `hostname` reports — agents prefer mDNS
  (`http://<pi-host>.local:5000`) so the URL survives network moves.
- NAS provides shared storage at e.g. `\\<NAS>\Share` (Windows) ↔
  `/mnt/share/` (Linux — see Help recipes for CIFS mount).
- Lab PCs have any user-defined names — the dashboard shows whatever the
  agent registers as `computer_name` on first heartbeat.

---

## Repo layout

```
databased/
  agent/                  Windows agent source (built into databased-agent.exe)
    agent.py
    tray.py               tray icon + menu
    config_ui.py          first-run setup wizard (Tk)
    build.ps1             PyInstaller --onedir build (Python 3.8 for Win7+)
    databased-agent.spec  PyInstaller spec (committed, controls bundling)
    requirements.txt      runtime deps pinned for Python 3.8 compat
  pi/                     Flask orchestrator
    app.py                app factory + routes
    models.py             SQLAlchemy models
    init_db.py            idempotent migration runner
    scheduler.py          APScheduler reconciler
    maintenance.py        prune stale logs
    alerts.py             failure / offline / storage alerts
    notify.py             outgoing webhook (Slack-compatible)
    tunnel.py             tinyproxy ACL sync + idle watchdog auto-off
    api/                  Flask blueprints
  web/                    React dashboard (Vite)
    src/                  …all components
    public/games/         live-served via Flask /games/<file>
  tools/
    configure_agents.py   mass-update agent.json (network-move helper)
    install_internet_tunnel.sh
    databased-tunnel      privileged helper for tinyproxy ACL writes
  vendor/
    tightvnc/             bundled TightVNC installers (admin convenience)
  deploy/
    systemd/databased.service
    guacamole/            docker-compose for Guacamole
```

---

## Build & ship the agent (every code change)

Prerequisites: **Python 3.8** installed on the Windows build machine
(provides Win7-through-Win11 binary compatibility).

```bash
# Linux side: commit and push your changes
cd /home/<your-user>/databased
git add -A && git commit -m "..."
git push
```

```powershell
# Windows build PC
cd C:\build\databased
git pull
cd agent
.\build.ps1
robocopy dist\databased-agent \\<NAS>\Share\Databased\Agent\databased-agent /MIR
```

```
# Web dashboard: Settings → Fleet → Push update to all
```

Agents on 0.19+ self-update from this NAS path within seconds.

---

## DB migrations

Schema changes (new column on a model) require running the migration once:

```bash
cd /home/<your-user>/databased
.venv/bin/python -m pi.init_db
sudo systemctl restart databased
```

Idempotent — safe to re-run on every deploy. New columns are added in
`pi/init_db.py`'s `ADD_COLUMNS` dict.

---

## Common commands

```bash
# Restart orchestrator
sudo systemctl restart databased

# Tail logs
sudo journalctl -u databased -f

# Apply DB migration
.venv/bin/python -m pi.init_db

# Inspect agent versions
.venv/bin/python -c "
from pi.app import create_app
from pi.models import db, Computer
app = create_app()
with app.app_context():
    for r in db.session.execute(db.select(Computer.name, Computer.agent_version)).all():
        print(r)"

# Mass-update agent.json across PCs (after a network move)
.venv/bin/python tools/configure_agents.py --base /mnt/share/Test \
  --pi-url http://<pi-host>.local:5000 --dry-run
```

In-app **Settings → Help & Reference** has more recipes (CIFS mount,
Win7 prereqs, internet tunnel, Pi remote desktop, etc.).

---

## Conventions

- **No comments** unless they explain *why* (not *what*).
- Inline styles in React via theme tokens in `web/src/theme.js`.
- Server processes never run as root; `sudoers` grants narrow NOPASSWD
  only for specific helper scripts.
- Encryption: Fernet for per-device RDP/VNC creds, key in `.env`.
- Agent uses `os._exit(0)` after spawning the auto-update bat so file
  handles release immediately and the bat can rename folders.

---

## Pending / known
- Public release: see top of repo README.
- Build-ready badge UI (Settings sidebar `(!)`) is wired on the backend
  (`/api/computers/build-status`) but the dashboard polling + render
  was not finished.
- "Push update to all" assumes every agent is on the same major
  version — older agents that don't know `update_requested_at` ignore it.
