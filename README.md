# DataBased

Self-hosted file-sync orchestrator for a small fleet of Windows machines.
A Linux box (Raspberry Pi or x86 mini-PC) runs the Flask + SQLite server
and dashboard; Windows machines run a tray-icon agent that watches
folders, executes syncs, and pushes metrics. In-browser RDP/VNC into
each machine via Apache Guacamole.

Originally built for a chemistry lab to keep instrument PCs syncing
their acquired data to a NAS, but generic enough to run anywhere a few
Windows boxes need to ship files to a central share with admin oversight.

## Screenshots

<!-- Drop screenshots into docs/screenshots/ and reference them here. -->
<!-- Suggested set: dashboard.png, settings-devices.png, settings-connections.png, gear-modal.png -->

<!-- Example:
![Dashboard overview](docs/screenshots/dashboard.png)
![Device admin glance view](docs/screenshots/settings-devices.png)
![Connections panel](docs/screenshots/settings-connections.png)
![Per-device gear modal](docs/screenshots/gear-modal.png)
-->


## Highlights

- **Push-button onboarding** — install the agent, run the wizard, approve
  on the dashboard.
- **Per-PC remote desktop** — RDP or VNC, in-browser via Guacamole, no
  client install on admin machines. Per-PC saved credentials.
- **Auto-update** — agents self-update from a NAS folder on the operator's
  schedule; one-click "Push update to all" from the dashboard.
- **Compare-and-sync preview** — review what'll change before a job runs
  for the first time.
- **Mirror / one-way / move** sync modes with safety prompts.
- **Watch mode + cron** — react to new files immediately, plus a periodic
  sweep.
- **Process watchdog** per device — surface "is the acquisition software
  running?" right on the card.
- **Internet tunnel** — air-gapped lab PCs can reach the web through the
  Pi (tinyproxy + per-PC opt-in toggle on the dashboard).
- **Slack-compatible alerts** — sync failures, agent offline, storage
  high-water mark.
- **Customizable instrument types** — bundled Lucide icon library
  (~1900 icons) plus paste-your-own-SVG; admin manages the master list.
- **Windows 7 → Windows 11** support — single Python 3.8 build runs on
  every supported Windows version.
- **Light + dark themes** — warm-cream palette for light, dark glass for
  dark.

## Architecture

```
┌──────────────────────────────┐         ┌────────────────────────┐
│  Linux orchestrator          │         │  Windows lab PCs        │
│  ──────────────────────────  │         │  ────────────────────  │
│  Flask + SQLite              │ ◄──────►│  databased-agent.exe    │
│  APScheduler                  │  HTTP  │  (tray icon)             │
│  Tinyproxy (optional)        │         │  watches source dirs     │
│  Guacamole (Docker)          │         │  pushes metrics          │
│  React dashboard             │         │  syncs to NAS            │
└──────────────┬───────────────┘         └──────────────┬─────────┘
               │                                         │
               └─────────────  \\<NAS>\Share  ──────────┘
```

## Stack

- **Server**: Python 3.11+, Flask, SQLAlchemy 2, SQLite, APScheduler,
  Flask-Login, bcrypt, Fernet (cryptography)
- **Agent**: Python 3.8, PyInstaller (onedir), psutil, watchdog, requests,
  pystray
- **Web**: React 18, Vite, lucide-react, no UI framework (inline styles
  + theme tokens)
- **Optional**: Apache Guacamole for in-browser RDP/VNC, tinyproxy for the
  internet tunnel

## Quick start (Linux orchestrator)

```bash
git clone https://github.com/<you>/databased.git
cd databased

# Python venv + deps
python3 -m venv .venv
.venv/bin/pip install -r pi/requirements.txt

# Web bundle
cd web && npm install && npm run build && cd ..

# Config
cp .env.example .env
# edit .env — set SECRET_KEY, FERNET_KEY, ADMIN_PASSWORD

# Initialize DB + seed admin user
.venv/bin/python -m pi.init_db

# Run
.venv/bin/python -c "
from pi.app import create_app
from pi import scheduler
from pi.host_metrics import host
app = create_app()
scheduler.start(app)
host.start()
app.run(host='0.0.0.0', port=5000)
"
```

Open `http://<this-host>:5000` in a browser, sign in with
`ADMIN_USERNAME` / `ADMIN_PASSWORD`. For systemd auto-start, see
`deploy/systemd/databased.service` (edit the `CHANGE_ME_USER`
placeholders first).

## Building the Windows agent

Requires Python 3.8 on the build machine (latest 3.8.x; the Windows `py`
launcher picks it via `-3.8`):

```powershell
cd agent
.\build.ps1
# Output: dist\databased-agent\
```

Drop the entire `databased-agent\` folder on each Windows PC, double-click
`databased-agent.exe`, run the wizard. The PC heartbeats to the
orchestrator and shows up as "Pending Approval" on the dashboard.

## Optional services

- **Guacamole** for in-browser remote desktop — see
  `deploy/guacamole/docker-compose.yml`.
- **Internet tunnel** for offline/air-gapped lab PCs — see
  `tools/install_internet_tunnel.sh`.

## Documentation

- **`HANDOFF.md`** — quick context for a new contributor (architecture,
  build flow, conventions).
- **In-app `Settings → Help & Reference`** — recipes for common
  operational tasks (mount NAS, add a Windows 7 PC, mass-update agent
  configs after a network move, etc.).

## License

MIT — see [LICENSE](LICENSE).

## Status

Working in production at one chemistry lab. Public release is fresh —
expect rough edges around documentation, deployment scripts that assume
specific layouts, and lab-specific defaults that aren't fully extracted
yet. PRs welcome.
