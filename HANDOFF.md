# DataBased — Project Handoff / Quick Start

A snapshot of architecture, build flow, current features, and pending
work. Drop into a fresh chat or onboard a new contributor and they pick
up without losing context.

> Replace placeholders like `<pi-host>`, `<your-user>`, `<NAS>`, etc. with
> the actual values for your deployment. The committed source uses these
> placeholders so it's safe to publish.

**Public repo:** https://github.com/rvignone-sys/Databased
**License:** MIT

---

## What it is

Self-hosted file-sync orchestrator for a small fleet of Windows machines.
A Linux box (Raspberry Pi or x86 mini-PC / NAS) runs Flask + SQLite +
APScheduler as the orchestrator; Windows machines run a PyInstaller
agent (system tray app) that heartbeats, watches folders, executes
syncs, and pushes metrics. A React dashboard on the orchestrator
visualizes everything; an admin panel manages users, instrument types,
fleet ops, and per-device config.

Originally built for a chemistry lab to keep instrument PCs syncing
their acquired data to a NAS, but generic enough to run anywhere a few
Windows boxes need to ship files to a central share with admin oversight.

---

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────┐
│  Linux orchestrator         │         │  Windows lab PCs         │
│  ─────────────────────────  │         │  ──────────────────────  │
│  Flask + SQLite             │ ◄──────►│  databased-agent.exe     │
│  APScheduler                │   HTTP  │  (tray icon)             │
│  Tinyproxy (optional)       │         │  watches source dirs     │
│  Guacamole (Docker)         │         │  pushes metrics          │
│  React dashboard            │         │  syncs to NAS            │
└──────────────┬──────────────┘         └──────────────┬───────────┘
               │                                        │
               └─────────────  \\<NAS>\Share  ──────────┘
```

- Orchestrator typically lives at `/home/<your-user>/databased`. mDNS
  hostname (e.g. `http://databased.local:5000`) is preferred so agents
  survive IP changes.
- NAS provides shared storage at `\\<NAS>\Share` (Windows) ↔
  `/mnt/share/` (Linux — see Help recipes for CIFS mount).
- Lab PCs register with whatever name the agent's wizard collects as
  `computer_name`.

---

## Repo layout

```
databased/
  agent/                    Windows agent source (PyInstaller onedir)
    agent.py                main loops + auto-update
    tray.py                 tray icon + menu
    config_ui.py            first-run setup wizard (Tk)
    build.ps1               Python 3.8 build (Win7→Win11 compat)
    databased-agent.spec    PyInstaller spec — committed, controls bundling
    requirements.txt        pinned for Python 3.8 compat
  pi/                       Flask orchestrator
    app.py                  app factory + routes
    models.py               SQLAlchemy models
    init_db.py              idempotent migration runner
    scheduler.py            APScheduler reconciler
    maintenance.py          prune stale logs
    alerts.py               failure / offline / storage alerts
    notify.py               outgoing webhook (Slack-compatible)
    tunnel.py               tinyproxy ACL sync + idle watchdog
    crypto.py               Fernet wrapper for stored RDP/VNC creds
    guacamole.py            REST client for Guacamole session minting
    host_metrics.py         psutil → in-memory ring buffer
    metrics_store.py        per-computer metrics ring buffer
    api/                    Flask blueprints
      agent.py              heartbeat, metrics push, log push, etc.
      computers.py          list, PATCH, RDP/VNC session, push-update
      jobs.py               sync job CRUD + compare
      logs.py               log query
      settings.py           LabSettings PATCH + test-notify
      users.py
      instrument_types.py
      repo.py               git info + pull (admin)
  web/                      React dashboard (Vite)
    src/
      App.jsx               TypesProvider + Shell
      Dashboard.jsx         lab overview + cards + recent activity
      Settings.jsx          admin panel (Identity, Storage, Devices,
                            Users + Types, Fleet, Connections, Help)
      InstrumentConfig.jsx  per-device gear modal
      InstrumentTypesSection.jsx
      ConnectionsSection.jsx  Git / Slack / Box / Dropbox / GDrive
      HelpSection.jsx       collapsible recipe library
      RdpModal.jsx          Guacamole iframe modal (RDP & VNC)
      CompareModal.jsx      pre-sync file preview
      JobModal.jsx          sync job CRUD UI
      Resources.jsx         live CPU/RAM/disk panel (per-device)
      typesContext.jsx      key→InstrumentType lookup for icons
      icons.jsx             InstIcon resolver (custom SVG → Lucide → built-in)
      theme.js              dark + light palettes; LIGHT_OVERRIDES_CSS
      api.js                fetch wrappers
    public/games/           live-served via Flask /games/<file>
                            (gitignored — user content)
  tools/
    configure_agents.py     mass-update agent.json (network-move helper)
    install_internet_tunnel.sh
    databased-tunnel        privileged helper (writes /etc/tinyproxy.conf)
  vendor/
    tightvnc/               bundled TightVNC installers (admin convenience)
  deploy/
    systemd/databased.service   sample unit (CHANGE_ME_USER placeholders)
    guacamole/                  docker-compose for Guacamole
  docs/
    screenshots/              README screenshots
  HANDOFF.md                  this file
  README.md                   public-facing
  LICENSE                     MIT
  .env.example                every env var the codebase reads
  .gitignore
```

---

## Key features (as of this writing)

### Onboarding & devices
- `device_kind` field (instrument | pc | server) — drives card layout later
- Per-device config via gear modal (Settings → Devices → Configure)
- Initial sync job created with `enabled=False` so admin reviews first
- Pending Review panel on dashboard with Compare + Approve + Reject
- "Add Instrument" lives in Settings → Fleet (was on dashboard, moved)

### Sync
- One-way / mirror / move directions (gear modal warns on destructive)
- Watch mode + cron schedule per job
- Compare-and-sync preview (full diff before first run)
- file_list captured per log entry; expandable in Recent Activity

### Auto-update
- onedir bundle, swap whole `databased-agent\` folder
- bat hardening: cd to %SystemRoot%, pre-clean stale `.old`, bounded retries
- Multi-URL fallback (`pi_url_alt`) — agent probes alts when primary down
- "Push update to all" admin button; per-PC override via gear modal

### Remote desktop
- Guacamole-based, in-browser RDP & VNC
- Per-device protocol toggle, encrypted creds (Fernet)
- "In use" warning before connecting
- Pi Host VNC button (Settings → Pi Host) — env-driven protocol/port

### Internet tunnel
- tinyproxy on the orchestrator
- Per-PC opt-in via wifi icon in card hover row
- Watchdog auto-off after 30 min idle (uses agent's idle metrics)

### Process watchdog
- Per-PC list of process names (gear modal)
- Agent reports running/stopped, dashboard shows badges in Resources

### Notifications
- Outgoing webhook (Slack-compatible JSON + structured `databased.*` block)
- 3 toggles: failure / success / manual
- "Send test" button

### Customizable instrument types
- Master list in Settings → Instrument Types (admin)
- Three icon sources per type: built-in (8 SVGs), Lucide library
  (~1964 icons via dynamic imports + category chips), custom SVG paste
- Sanitizer strips script/iframe/foreignObject/on*= server-side
- Pencil opens full edit form (label + icon source); key is read-only
  (Computer.icon_type stores by value)

### Connections
- Settings → Connections card with collapsible rows:
  - **Git** — branch/commit/remote URL/SSH public key + Pull button
  - **Slack** — webhook + toggles + Test (folded in from old Notifications card)
  - **Box / Dropbox / Google Drive** — coming-soon stubs
- Each row has a status badge (connected / not set / coming soon)

### Help & Reference
- Collapsible card at the bottom of Settings (admin only)
- Recipes for: NAS mount, Win7 prereqs, headless Pi resolution,
  internet tunnel setup, network-move agent.json mass-update, etc.

### Public release polish
- Identity card (was "Lab Identity"): Site name + Logo + Dashboard heading
- All hardcoded lab/IP/hostname identifiers stripped from source
- README + LICENSE (MIT) + .env.example committed

---

## Build & ship the agent

Prerequisites: **Python 3.8** on the Windows build machine.

```bash
# Linux side: commit + push
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

Then **Settings → Fleet → Push update to all** in the dashboard. Agents
on 0.19+ self-update from the NAS within seconds.

Current agent version: see `AGENT_VERSION` in `agent/agent.py`. Bump it
on any user-facing change.

---

## DB migrations

```bash
cd /home/<your-user>/databased
.venv/bin/python -m pi.init_db
sudo systemctl restart databased
```

Idempotent — safe to re-run on every deploy. New columns go in
`pi/init_db.py`'s `ADD_COLUMNS` dict.

---

## Common commands

```bash
# Restart orchestrator
sudo systemctl restart databased
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

# Mass-update agent.json (network move)
.venv/bin/python tools/configure_agents.py --base /mnt/share/Test \
  --pi-url http://databased.local:5000 \
  --pi-url-alt http://192.168.1.50:5000 \
  --dry-run
```

In-app **Settings → Help & Reference** has more (CIFS mount, Win7
prereqs, internet tunnel install, headless display fix, etc.).

---

## Conventions

- **No comments** unless they explain *why* (not *what*).
- React: inline styles via `theme.js` `D` tokens. No CSS framework.
- Server processes never run as root; sudoers grants narrow NOPASSWD
  only for specific helper scripts.
- Encryption: Fernet for per-device RDP/VNC creds, key in `.env`.
- Agent uses `os._exit(0)` after spawning the auto-update bat so file
  handles release immediately.
- Type-form patterns: shared `TypeForm` for create + edit; key is
  immutable on edit because `Computer.icon_type` stores by key value.
- Flask context: `current_app._get_current_object()` when passing app
  to background threads / scheduler jobs.

---

## Current focus / pending work

### Active: move orchestrator from Pi → UGREEN NAS

User has a UGREEN NAS (Intel CPU, Docker pre-installed) and wants to
host DataBased there instead of the Pi. Two phases:

1. **Phase 1 — Dockerize**: write a multi-stage Dockerfile (Node
   stage builds web bundle, Python stage runs Flask) + docker-compose.yml
   with named volumes for `pi/data/`. Optionally include Guacamole as
   a sibling service. Document migrating `databased.db` + `uploads/` from
   the Pi's filesystem into the NAS volume.

2. **Phase 2 — NAS data on dashboard**: mount `/proc:/host/proc:ro` and
   `/sys:/host/sys:ro` into the container so psutil reports the *NAS
   host* (not the container). Surface NAS storage/SMART/pool info either
   as a `server`-kind device card or a dedicated "NAS Storage" sidebar
   panel.

### Other pending
- **Build-ready badge UI** is wired backend-side
  (`/api/computers/build-status` + `last_pushed_at` settings) but the
  dashboard polling + `(!)` indicator on the Settings nav item was never
  finished.
- **Lab Buddy bot integration**: webhook outgoing path is built; intake
  URL/auth not configured yet (user has a Lab Buddy bot they'll wire later).
- **Agent process supervisor**: when the auto-update bat fails, a manual
  recovery is documented in Help. Could automate by having agent on
  startup detect leftover `.new`/`.old`/`_databased_update.bat` and
  finish the swap.
- **Per-org branding**: top-bar subtitle "SYNC MANAGER", a couple of
  Settings card titles still use "Fleet" / "Devices" — these are mostly
  generic enough but could become configurable strings if forks want.
- **Build pipeline once build PC is on lab network**: replace the
  RDP → Box → Mac → NAS cycle with a one-click dashboard button that
  SSHes into the build PC, runs `git pull && build.ps1`, robocopies
  straight to the NAS, then bumps `last_pushed_at`. Atomic swap:
  build to `databased-agent.NEW`, verify file count, rename. Stretch:
  GitHub webhook → autobuild on push.

---

## Recent feature changelog

A running list of what's landed since the last big handoff snapshot —
the bullets above describe steady-state behavior; this section says
when each piece arrived and what to remember about it.

### Agent v0.27.0 (current)
- **`safe_copy()`**: replaces `shutil.copy2` for sync writes. Refuses
  to overwrite a non-empty destination with a 0-byte source (instrument
  watchdog races); samples size 3× over 3s for files modified in the
  last 90s (catches mid-write); writes to `<name>.databased.tmp` then
  `os.replace()` for atomic landing; verifies post-copy size match.
- **`exclude_patterns`** per job (comma-separated globs, matched against
  basename and source-relative path). Mirror also leaves matched files
  alone at destination. Edited in JobModal.
- **`files_ignored`** counter — distinct from `files_skipped` (which is
  conflict-mode skip). Surfaces as `⊘N` in Recent Activity.

### Agent v0.25.0
- **`agent_id` (UUID4)** persisted in `agent.json`, sent on every
  request. Server resolves Computer rows by agent_id first, name second.
  Renaming on dashboard no longer creates duplicate pending entries.
  Dashboard `name` is display-only — agent's local `computer_name`
  (Windows hostname) is never overwritten.

### Server / dashboard
- `lab_settings.dashboard_heading` + `last_pushed_at` migration (was
  causing 500s on Pis predating the Identity card).
- `computers.category` (free-text, per-device override label) — edited
  in gear modal under Display name / Icon. Falls back to InstrumentType
  label when blank.
- `computers.monitored_disk_mounts` (JSON list of mountpoints) — gear
  modal "Drives to monitor" picker for file-server devices. Empty =
  show all mounts (legacy).
- **Card title cleanup**: cards now show device name only; server-kind
  cards no longer fall back to "Instrument" as title.
- **Sync Jobs Source column**: "Name · Category" format matching the
  card subtitle convention. JobModal dropdown does the same.
- **Recent Activity**: warning/failed log rows display `error_message`
  in a colored callout (yellow for warning, red for failed). Counts
  show `↑copied ↷skipped ⊘ignored ✕failed`.
- **HelpSection.jsx**: `import.meta.glob("./help-local.jsx", ...)`
  hook merges in optional gitignored personal recipes alongside the
  public ones — drop `web/src/help-local.jsx` for env-specific paths
  without polluting commits.

### One-click build/ship scripts (local, gitignored)
- **Windows `.bat`**: `cd C:\build\databased && git pull && cd agent &&
  powershell -File build.ps1 && robocopy dist\databased-agent
  C:\Users\<you>\Box\Agent\databased-agent /MIR`. Stop on error, pause
  at end.
- **Mac `.command`**: `rsync -av --delete ~/.../Box-Box/Agent/
  databased-agent/ /Volumes/<share>/.../databased-agent/`. Pre/post
  file-count check guards against the partial-Box-sync trap that
  produces 0-byte `_internal/_tk_data/tk.tcl`.
- Not committed — paths are deployment-specific. Recipes live in
  `web/src/help-local.jsx` (also gitignored).

---

## How to start a Claude Code session for this project

```
You're working on DataBased, a self-hosted file-sync orchestrator for a
small fleet of Windows machines. Read HANDOFF.md in the repo root for
architecture, conventions, and current focus. Source is at
github.com/rvignone-sys/Databased.

The current priority is moving the orchestrator from a Raspberry Pi to
a UGREEN NAS (Intel CPU, Docker pre-installed). See "Current focus" in
HANDOFF.md — Phase 1 is Dockerize, Phase 2 is NAS data on the dashboard.
```

Then ask whatever specific task you want to start on.
