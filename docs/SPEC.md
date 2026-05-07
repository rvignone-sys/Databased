# DataBased — File Sync Manager + Remote Desktop

Consolidated spec. Incorporates the original sync-manager design plus decisions made during planning: React frontend, Apache Guacamole for remote desktop, self-service "add a PC" flow.

---

## 1. Overview

A Raspberry Pi orchestrates file synchronization across lab Windows machines and serves as a remote-desktop gateway. Each Windows machine runs a lightweight agent. A web dashboard on the Pi configures jobs, monitors machine health, triggers manual syncs, and embeds a remote-desktop session per machine.

**Network assumption:** closed/offline lab network. HTTP is fine; encryption is not a v1 concern.

---

## 2. Architecture

### Components
1. **Pi Orchestrator** — Flask backend, SQLite, APScheduler.
2. **Guacamole Stack** — `guacd` + Tomcat web app, runs on the Pi alongside Flask. Provides browser-based RDP.
3. **Windows Agent** — portable Python exe, self-registers with the Pi, executes sync commands, watches folders.
4. **Web Dashboard** — React + Vite SPA, served by Flask in production.

### Process layout on the Pi
| Process | Port | Purpose |
|---|---|---|
| Flask (gunicorn) | 5000 | Dashboard + API |
| Tomcat (Guacamole web) | 8080 | Remote-desktop client (embedded as iframe) |
| guacd | 4822 | Guacamole proxy daemon (RDP/VNC) |
| Vite dev server | 5173 | Dev only |

---

## 3. Database Schema (SQLite)

### `computers`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT UNIQUE | Friendly name set during agent install |
| ip_address | TEXT | |
| status | TEXT | `pending`, `approved`, `disabled` |
| last_heartbeat | DATETIME | |
| uptime_seconds | INTEGER | |
| is_online | BOOLEAN | Derived from last_heartbeat freshness |
| storage_used_gb | FLOAT | |
| agent_version | TEXT | |
| icon_type | TEXT | One of: `orbitrap`, `smps`, `chamber`, `gcms`, `gcfid`, `uvvis`, `inficon` |
| **rdp_username** | TEXT | |
| **rdp_password_encrypted** | TEXT | Fernet-encrypted with a key from `.env` |
| **rdp_port** | INTEGER | Default 3389 |
| **rdp_security_mode** | TEXT | `any`, `nla`, `rdp`, `tls`. Use `rdp` for Win 7. |
| created_at | DATETIME | |
| approved_at | DATETIME | NULL until approved |

### `sync_jobs`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | |
| source_computer_id | FK → computers.id | |
| source_folder_path | TEXT | |
| target_folder_path | TEXT | |
| sync_direction | TEXT | `one-way`, `bidirectional` (v2) |
| conflict_handling | TEXT | `skip`, `version-number`, `timestamp-suffix` |
| enabled | BOOLEAN | |
| schedule_cron | TEXT | NULL if manual/watch only |
| watch_mode_enabled | BOOLEAN | |
| watch_mode_delay_seconds | INTEGER | Default 30 |
| created_at, updated_at | DATETIME | |

### `sync_logs`
Same as original spec.

### `slack_config`
Same as original spec.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| username | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| created_at | DATETIME | |

v1 ships with one admin user, seeded from `.env` on first run. Future split: dashboard user vs. RDP cred owner.

---

## 4. Add-a-PC Flow

The system MUST support adding a new machine without editing files on the Pi.

### Agent install (on the new Windows PC)
1. Operator opens the dashboard, clicks **Download Agent** → downloads `databased-agent.exe`.
2. Runs the exe as Administrator.
3. Prompts (one-shot config wizard):
   - Pi IP address
   - Friendly name for this PC
   - Icon type (dropdown)
4. Saves config to `%ProgramData%\DataBased\agent.json`.
5. Self-installs as Windows service `DataBasedAgent`.
6. Service starts → sends first heartbeat to Pi.

### Pi side
1. Heartbeat from unknown computer → INSERT into `computers` with `status='pending'`.
2. Dashboard shows it under **Pending Approval** with a yellow badge.
3. Operator clicks **Approve**:
   - Confirms the friendly name.
   - Enters RDP creds (or leaves blank to skip remote-desktop for now).
   - Status flips to `approved`, `approved_at` set.
4. Operator can now create sync jobs for that machine and use Remote Desktop.

### Pending = no commands
A `pending` machine receives no sync jobs. Heartbeats are accepted (so it shows up) but `/agent/config` returns an empty job list until approved.

---

## 5. API Contracts

### Agent → Pi (no auth, closed network)
- `POST /agent/heartbeat` — same payload as original spec, plus `friendly_name` and `icon_type` on first call.
- `GET /agent/config` — returns assigned jobs (empty if `pending`).
- `POST /agent/log` — agent reports a completed sync.

### Pi → Agent
- `POST /agent/sync` — same as original spec.

### Dashboard → Pi (auth required)
- `GET /api/computers` — all machines with status filter.
- `POST /api/computers/<id>/approve` — approval flow.
- `PATCH /api/computers/<id>` — edit name, RDP creds, icon.
- `DELETE /api/computers/<id>` — remove (and unassign jobs).
- `POST /api/computers/<id>/rdp-session` — mints a Guacamole token, returns `{ url: "http://pi:8080/guacamole/#/client/..." }` for the dashboard to embed in an iframe.
- `GET /api/agent/download` — serves the prebuilt exe.
- `GET /api/jobs`, `POST /api/jobs`, `PUT /api/jobs/<id>`, `DELETE /api/jobs/<id>`.
- `POST /api/jobs/<id>/trigger` — manual sync trigger.
- `GET /api/logs?...filters` — sync log query.
- `GET/POST /api/slack/config`.

---

## 6. Remote Desktop (Apache Guacamole)

### Why Guacamole
- Uses Windows' built-in RDP — nothing extra to install on the lab PCs.
- Browser-only client (HTML5 canvas), embeddable as iframe.
- All Win 7–11 Enterprise machines support RDP out of the box.

### Integration
- Guacamole runs on the Pi (Tomcat on :8080, `guacd` on :4822).
- Guacamole's auth is delegated to Flask via the Guacamole REST API:
  1. Dashboard click on a computer card → calls `POST /api/computers/<id>/rdp-session`.
  2. Flask uses Guacamole's REST API to create an ephemeral connection from the stored RDP creds and mint a session token.
  3. Flask returns the embeddable URL.
  4. Dashboard opens it in a modal iframe.
- This is "SSO" for v1 — one dashboard login, no second prompt.

### Win 7 caveat
- Use `rdp_security_mode='rdp'` (not `nla`) for Win 7 connections. NLA support varies depending on patches.
- For modern PCs, default to `any` (Guacamole negotiates).

### Future
- Split RDP creds from dashboard creds (per-PC RDP user separate from dashboard user).
- Session recording (Guacamole supports it natively).

---

## 7. Frontend

### Stack
- **React 18 + Vite** — picked because the existing mockup (`mockup/databased_instrument_sync_dashboard_mockup.jsx`) is React with `useMemo`/`useState` and inline styles.
- No Tailwind, no component library — keep the mockup's inline-styled aesthetic.
- Production build: `vite build` → static assets served by Flask.
- Dev: Vite dev server on :5173 with proxy to Flask :5000 for `/api/*`.

### Pages (v1)
1. **Login** — username/password.
2. **Instruments** (the existing mockup, wired to live data) — main dashboard, computer cards.
3. **Pending Approval** — surfaces newly-registered machines.
4. **Sync Jobs** — table + create/edit form.
5. **Logs** — filterable table, CSV export.
6. **Settings** — Slack config, admin user.

### Asset handling
PNGs in `mockup/assets/` (will move to `web/src/assets/`). Mapping:
| Icon type | File |
|---|---|
| orbitrap | Orbitrap.png |
| smps | SMPS.png |
| chamber | Chamber.png |
| gcms | GCMS.png |
| gcfid | GCFID.png |
| uvvis | UVVIS.png |
| inficon | PGCMS.png |

---

## 8. Project Layout

```
TBN_Databased/
├── pi/                  # Flask backend
│   ├── app.py
│   ├── models.py        # SQLAlchemy models
│   ├── api/             # Route blueprints
│   ├── guacamole.py     # Guac REST API helpers
│   ├── scheduler.py     # APScheduler setup
│   └── requirements.txt
├── web/                 # React + Vite SPA
│   ├── src/
│   │   ├── App.jsx      # (port of the mockup, wired to API)
│   │   ├── api.js
│   │   └── assets/      # PNGs
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── agent/               # Windows agent
│   ├── agent.py
│   ├── installer.py     # Config wizard + service install
│   ├── build.py         # PyInstaller wrapper
│   └── requirements.txt
├── docs/
│   └── SPEC.md          # this file
├── mockup/              # original design ref (kept for diff)
└── deploy/
    ├── guacamole/       # docker-compose for Guac on the Pi
    └── systemd/         # service units for Flask + agent build pipeline
```

---

## 9. Deployment

### Pi
1. `apt install python3 python3-pip docker.io docker-compose` (Docker only for Guacamole).
2. `cd pi && pip install -r requirements.txt`
3. `python -m pi.init_db` (creates SQLite, seeds admin user from `.env`).
4. `cd deploy/guacamole && docker-compose up -d` (Guacamole + guacd in containers — easiest path on a Pi).
5. Flask via systemd: `systemctl enable --now databased-pi.service`.
6. Dashboard at `http://<pi-ip>:5000`.

### Windows lab PC
1. Browse to `http://<pi-ip>:5000` → click **Download Agent**.
2. Run the exe as admin → wizard → done.
3. Approve the machine in the dashboard.

---

## 10. Roadmap

### Phase 1 — Core (home test target)
- [ ] Pi: Flask + SQLite + APScheduler
- [ ] Pi: REST API (auth, computers, jobs, logs, agent endpoints)
- [ ] Web: scaffold Vite + port mockup to `App.jsx` + wire to live data
- [ ] Agent: heartbeat + manual sync execution + service install
- [ ] Add-PC flow: pending → approved
- [ ] Manual sync trigger from dashboard
- [ ] Sync logs

### Phase 1.5 — Remote Desktop
- [ ] Guacamole docker-compose on Pi
- [ ] Flask ↔ Guacamole REST integration
- [ ] Dashboard embed (modal iframe per computer card)

### Phase 2
- [ ] Watch-mode auto-sync
- [ ] Cron scheduling UI
- [ ] Slack notifications (success/failure/manual)
- [ ] CSV log export
- [ ] Agent auto-update

### Phase 3
- [ ] Bidirectional sync
- [ ] HTTPS + token-based agent auth
- [ ] Split dashboard creds from RDP creds
- [ ] Session recording for RDP
- [ ] Bandwidth throttling, file filtering

---

## 11. Home Test Setup (your iteration loop)

Minimum viable setup to test everything end-to-end:
- **Pi**: runs Flask + Guacamole.
- **Your Windows PC**: runs the agent, RDP enabled.
- **Sync target**: a folder on the Pi (mounted SMB share or local path).

Test cycle:
1. Build agent exe on Pi (PyInstaller cross-compile is messy — easier to build the exe on the Windows PC itself, or use a Windows VM. Decide before Phase 1 is done.).
2. Install agent on PC → approve in dashboard.
3. Create a sync job (PC folder → Pi folder).
4. Trigger manually → verify files copied.
5. Open Remote Desktop from the dashboard → verify Guacamole works.
6. Add a second "machine" (a second user on the same PC, or a laptop) → verify multi-PC flow.

---

## 12. Open Questions / Decisions Deferred

- **Agent build host**: building Windows exe on the Pi requires Wine + PyInstaller hacks. Cleaner to maintain a build script that runs on a Windows machine. Decide before agent work starts.
- **Guacamole DB**: Guac needs its own DB (Postgres/MySQL). Use SQLite-via-JDBC? Probably simpler to add a tiny Postgres container alongside.
- **Icon types are fixed** — if you add a new instrument class, the `icon_type` enum and the asset mapping both need updates. Acceptable for v1; could be a database-backed lookup later.
