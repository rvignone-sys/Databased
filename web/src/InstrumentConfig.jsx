import { useEffect, useState } from "react";
import { api } from "./api";
import { D, ICON_LABELS } from "./theme";
import { UI, InstIcon } from "./icons";

// Hardcoded fallback in case the API call fails — kept in sync with the
// model's seed list. Real list comes from /api/instrument-types so admin
// edits in Settings → Instrument Types show up here too.
const FALLBACK_ICON_OPTIONS = ["computer", "orbitrap", "smps", "chamber", "gcms", "gcfid", "uvvis"];
const CONFLICT_OPTIONS = [
  { v: "skip-if-same-size", label: "Skip if same name + size (recommended)" },
  { v: "skip", label: "Skip if exists" },
  { v: "version-number", label: "Append _v1, _v2…" },
  { v: "timestamp-suffix", label: "Append timestamp" },
];

const DIRECTION_OPTIONS = [
  { v: "one-way", label: "One-way · add + update" },
  { v: "mirror", label: "Mirror (deletes from target)" },
  { v: "move", label: "Move (deletes from source)" },
];

const inputStyle = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(0,0,0,.30)",
  color: "#fff",
  fontSize: 12,
  fontFamily: "Geist Mono",
  outline: "none",
  boxSizing: "border-box",
};
const labelStyle = { fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 5 };
const sectionStyle = { padding: "16px 0", borderTop: "1px solid rgba(255,255,255,.06)" };

function emptyJobRow(computerId) {
  return {
    _new: true,
    name: "",
    source_computer_id: computerId,
    source_folder_path: "",
    target_folder_path: "",
    conflict_handling: "skip-if-same-size",
    sync_direction: "one-way",
    watch_mode_enabled: true,
    watch_mode_delay_seconds: 60,
    schedule_cron: "0 6 * * *",
    enabled: true,
  };
}

export default function InstrumentConfig({ computer, onClose, onSaved }) {
  const [name, setName] = useState(computer.name);
  const [iconType, setIconType] = useState(computer.icon_type);
  const [category, setCategory] = useState(computer.category ?? "");
  const [isFileServer, setIsFileServer] = useState(!!computer.is_file_server);
  const [monitoredMounts, setMonitoredMounts] = useState(
    Array.isArray(computer.monitored_disk_mounts) ? computer.monitored_disk_mounts : []
  );
  const [availableDisks, setAvailableDisks] = useState([]);
  const [deviceKind, setDeviceKind] = useState(computer.device_kind ?? "pc");
  const [watchProcesses, setWatchProcesses] = useState(computer.watch_processes ?? "");
  // Pulled from /api/instrument-types so admin-managed types show up here.
  // Falls back to the hardcoded list if the API call fails.
  const [iconOptions, setIconOptions] = useState(
    FALLBACK_ICON_OPTIONS.map((k) => ({ key: k, label: ICON_LABELS[k] ?? k }))
  );
  useEffect(() => {
    api.instrumentTypes()
      .then((rows) => setIconOptions(rows.map((t) => ({ key: t.key, label: t.label }))))
      .catch(() => { /* fallback already in state */ });
  }, []);
  const [updateSourcePath, setUpdateSourcePath] = useState(computer.update_source_path ?? "");
  const [metricsInterval, setMetricsInterval] = useState(computer.metrics_interval ?? 5);
  const [heartbeatInterval, setHeartbeatInterval] = useState(computer.heartbeat_interval ?? 30);
  const [pollInterval, setPollInterval] = useState(computer.poll_interval ?? 5);
  // Remote-desktop credentials. password is write-only — the API only reports
  // whether one is configured, never the plaintext.
  const [remoteProtocol, setRemoteProtocol] = useState(computer.remote_protocol ?? "vnc");
  const [rdpUsername, setRdpUsername] = useState(computer.rdp_username ?? "");
  const [rdpPassword, setRdpPassword] = useState("");
  const [rdpPort, setRdpPort] = useState(computer.rdp_port ?? (computer.remote_protocol === "rdp" ? 3389 : 5900));
  const [rows, setRows] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.jobs()
      .then((all) => setRows(all.filter((j) => j.source_computer_id === computer.id)))
      .catch((err) => setError(err.message));
  }, [computer.id]);

  // Fetch the agent's reported mounts so the file-server picker has live options.
  useEffect(() => {
    if (!isFileServer) return;
    let alive = true;
    api.metrics(computer.id)
      .then((d) => { if (alive) setAvailableDisks(d?.latest?.disks || []); })
      .catch(() => { /* leave empty; user can still see saved mounts */ });
    return () => { alive = false; };
  }, [computer.id, isFileServer]);

  function toggleMount(mount) {
    setMonitoredMounts((cur) => (
      cur.includes(mount) ? cur.filter((m) => m !== mount) : [...cur, mount]
    ));
  }

  function updateRow(i, patch) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch, _dirty: true } : r)));
  }
  function removeRow(i) {
    setRows((cur) => {
      const r = cur[i];
      if (!r._new) setRemoved((rem) => [...rem, r.id]);
      return cur.filter((_, idx) => idx !== i);
    });
  }
  function addRow() {
    setRows((cur) => [...cur, emptyJobRow(computer.id)]);
  }

  async function removeInstrument() {
    const ok = window.confirm(
      `Remove ${computer.name}?\n\nThis deletes its sync jobs and metrics.\n` +
      `If the agent is still running on the machine, it will re-register as Pending on its next heartbeat.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      await fetch(`/api/computers/${computer.id}`, { method: "DELETE", credentials: "include" });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      // 1. Computer-level fields
      const computerPatch = {};
      if (name !== computer.name) computerPatch.name = name;
      if (iconType !== computer.icon_type) computerPatch.icon_type = iconType;
      if (isFileServer !== !!computer.is_file_server) computerPatch.is_file_server = isFileServer;
      const prevMounts = Array.isArray(computer.monitored_disk_mounts) ? computer.monitored_disk_mounts : [];
      const sameMounts = prevMounts.length === monitoredMounts.length
        && prevMounts.every((m) => monitoredMounts.includes(m));
      if (!sameMounts) computerPatch.monitored_disk_mounts = monitoredMounts;
      if (deviceKind !== (computer.device_kind ?? "pc")) computerPatch.device_kind = deviceKind;
      if ((category ?? "") !== (computer.category ?? "")) computerPatch.category = category;
      if ((watchProcesses ?? "") !== (computer.watch_processes ?? "")) computerPatch.watch_processes = watchProcesses;
      if ((updateSourcePath ?? "") !== (computer.update_source_path ?? "")) computerPatch.update_source_path = updateSourcePath;
      if (Number(metricsInterval) !== (computer.metrics_interval ?? 5)) computerPatch.metrics_interval = Number(metricsInterval) || null;
      if (Number(heartbeatInterval) !== (computer.heartbeat_interval ?? 30)) computerPatch.heartbeat_interval = Number(heartbeatInterval) || null;
      if (Number(pollInterval) !== (computer.poll_interval ?? 5)) computerPatch.poll_interval = Number(pollInterval) || null;
      if (remoteProtocol !== (computer.remote_protocol ?? "vnc")) computerPatch.remote_protocol = remoteProtocol;
      if ((rdpUsername || "") !== (computer.rdp_username ?? "")) computerPatch.rdp_username = rdpUsername || null;
      if (rdpPassword) computerPatch.rdp_password = rdpPassword;
      if (Number(rdpPort) !== (computer.rdp_port ?? 5900)) computerPatch.rdp_port = Number(rdpPort) || (remoteProtocol === "rdp" ? 3389 : 5900);
      if (Object.keys(computerPatch).length) {
        await api.updateComputer(computer.id, computerPatch);
      }
      // 2. Deletions
      for (const id of removed) {
        await fetch(`/api/jobs/${id}`, { method: "DELETE", credentials: "include" });
      }
      // 3. Inserts + updates
      for (const r of rows) {
        if (!r.source_folder_path || !r.target_folder_path || !r.name) continue;
        const payload = {
          name: r.name,
          source_computer_id: computer.id,
          source_folder_path: r.source_folder_path,
          target_folder_path: r.target_folder_path,
          conflict_handling: r.conflict_handling,
          sync_direction: r.sync_direction || "one-way",
          watch_mode_enabled: r.watch_mode_enabled,
          watch_mode_delay_seconds: Number(r.watch_mode_delay_seconds) || 60,
          schedule_cron: r.schedule_cron || null,
          enabled: r.enabled,
        };
        if (r._new) {
          await fetch("/api/jobs", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else if (r._dirty) {
          await fetch(`/api/jobs/${r.id}`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,8,17,0.78)",
        backdropFilter: "blur(6px)",
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(640px, 90vh)",
          background: D.glass,
          border: D.glassBorder,
          borderRadius: 18,
          boxShadow: "0 30px 90px rgba(0,0,0,.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 10, background: "radial-gradient(circle, rgba(125,249,255,.14), transparent 65%)", display: "grid", placeItems: "center" }}>
            <InstIcon type={iconType} size={40} color={D.sub} accent={D.cyan} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: D.cyan, fontWeight: 700, letterSpacing: ".12em" }}>INSTRUMENT CONFIG</div>
            <h2 style={{ margin: "2px 0 0", color: "#fff", fontSize: 18, fontWeight: 700 }}>{computer.name}</h2>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.sub, cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <UI name="x" size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px", flex: 1, overflow: "auto", minHeight: 0 }}>
          {/* Details */}
          <div>
            <h3 style={{ margin: "0 0 12px", color: "#fff", fontSize: 13, fontWeight: 700 }}>Details</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Display name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Icon</label>
                <select value={iconType} onChange={(e) => setIconType(e.target.value)} style={{ ...inputStyle, fontFamily: "Geist" }}>
                  {iconOptions.map((o) => (
                    <option key={o.key} value={o.key} style={{ background: D.panel }}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Category</label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={iconOptions.find((o) => o.key === iconType)?.label || "(blank = use icon's label)"}
                style={inputStyle}
              />
              <div style={{ fontSize: 10, color: D.faint, marginTop: 4 }}>
                Free-text label shown after the device name on the dashboard (e.g. <code style={{ color: D.cyan }}>SMPS</code>, <code style={{ color: D.cyan }}>Aerosol Sizing</code>). Blank falls back to the icon's instrument-type label.
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Device kind</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { v: "instrument", label: "Instrument", hint: "lab equipment producing data" },
                  { v: "pc",         label: "PC",         hint: "regular workstation" },
                  { v: "server",     label: "Server",     hint: "file server / shared infra" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setDeviceKind(o.v)}
                    title={o.hint}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${deviceKind === o.v ? D.accentBorder : "rgba(255,255,255,.10)"}`,
                      background: deviceKind === o.v ? D.accentBg : "transparent",
                      color: deviceKind === o.v ? D.cyan : D.ink,
                      fontSize: 12,
                      fontWeight: deviceKind === o.v ? 700 : 600,
                      cursor: "pointer",
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: D.faint, marginTop: 4 }}>
                Drives what the dashboard shows for this device. Independent of the icon above.
              </div>
            </div>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12, color: D.ink, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isFileServer}
                onChange={(e) => setIsFileServer(e.target.checked)}
                style={{ accentColor: D.cyan }}
              />
              Use as file server (NAS host)
              <span style={{ fontSize: 11, color: D.faint, marginLeft: 6 }}>· pinned to the always-visible File Server panel</span>
            </label>

            {isFileServer ? (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,.18)", border: "1px solid rgba(255,255,255,.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Drives to monitor</label>
                  <span style={{ fontSize: 10, color: D.faint }}>
                    {monitoredMounts.length === 0 ? "all drives shown" : `${monitoredMounts.length} selected`}
                  </span>
                </div>
                {availableDisks.length === 0 && monitoredMounts.length === 0 ? (
                  <div style={{ fontSize: 11, color: D.faint }}>
                    Waiting for agent to report drives… (none selected = all drives are shown)
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {(() => {
                      const known = new Set(availableDisks.map((d) => d.mount));
                      const orphans = monitoredMounts.filter((m) => !known.has(m));
                      const rows = [
                        ...availableDisks.map((d) => ({ mount: d.mount, label: `${d.mount} · ${d.total_gb} GB`, present: true })),
                        ...orphans.map((m) => ({ mount: m, label: `${m} (offline)`, present: false })),
                      ];
                      return rows.map((r) => {
                        const checked = monitoredMounts.includes(r.mount);
                        return (
                          <label key={r.mount} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: r.present ? D.ink : D.faint, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMount(r.mount)}
                              style={{ accentColor: D.cyan }}
                            />
                            <span style={{ fontFamily: "Geist Mono" }}>{r.label}</span>
                          </label>
                        );
                      });
                    })()}
                  </div>
                )}
                <div style={{ fontSize: 10, color: D.faint, marginTop: 6 }}>
                  Pick the HDD(s) you want pinned to the File Server panel. Other mapped drives are ignored. Leave all unchecked to show every drive (legacy behavior).
                </div>
              </div>
            ) : null}

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Watched processes</label>
              <input
                type="text"
                value={watchProcesses}
                onChange={(e) => setWatchProcesses(e.target.value)}
                placeholder="Xcalibur.exe, Chromeleon.exe"
                style={{ ...inputStyle, fontFamily: "Geist Mono", fontSize: 12 }}
              />
              <div style={{ fontSize: 10, color: D.faint, marginTop: 4 }}>
                Comma-separated process names. Agent reports up/down for each — handy for "is the acquisition software running?" Empty = no watchdog.
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Update source override</label>
              <input
                type="text"
                value={updateSourcePath}
                onChange={(e) => setUpdateSourcePath(e.target.value)}
                placeholder="(blank = use lab default from Settings → Fleet)"
                style={{ ...inputStyle, fontFamily: "Geist Mono", fontSize: 12 }}
              />
              <div style={{ fontSize: 10, color: D.faint, marginTop: 4 }}>
                Where THIS agent pulls new builds from. Leave blank to inherit the lab-wide path. Useful for canary-testing a build on one PC.
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,.18)", border: "1px solid rgba(255,255,255,.06)" }}>
              <div>
                <div style={{ fontSize: 12, color: D.ink, fontWeight: 600 }}>Push update now</div>
                <div style={{ fontSize: 10, color: D.faint, marginTop: 2 }}>Triggers the agent to check the NAS share within seconds (no waiting for hourly tick).</div>
              </div>
              <button
                onClick={async () => {
                  try { await api.pushAgentUpdate(computer.id); setError("✓ Pushed — agent will check within seconds"); }
                  catch (err) { setError(err.message); }
                }}
                style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Push update
              </button>
            </div>
          </div>

          {/* Monitoring intervals — pushed to agent on next poll */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: 13, fontWeight: 700 }}>Monitoring</h3>
              <span style={{ fontSize: 10, color: D.faint, fontFamily: "Geist Mono" }}>seconds · applied next poll cycle</span>
            </div>
            <p style={{ margin: "4px 0 12px", fontSize: 11, color: D.sub }}>
              Lower = more responsive (live-feel CPU/RAM), higher = lighter on the PC. 5 s is a good default; drop to 1–2 s while you're tuning.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Metrics rate</label>
                <input
                  type="number" min="1" max="60"
                  value={metricsInterval}
                  onChange={(e) => setMetricsInterval(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Heartbeat</label>
                <input
                  type="number" min="5" max="300"
                  value={heartbeatInterval}
                  onChange={(e) => setHeartbeatInterval(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Sync poll</label>
                <input
                  type="number" min="1" max="60"
                  value={pollInterval}
                  onChange={(e) => setPollInterval(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Remote Desktop credentials — pre-populated for 1-click connect */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: 13, fontWeight: 700 }}>Remote Desktop</h3>
              <span style={{ fontSize: 10, color: D.faint, fontFamily: "Geist Mono" }}>
                {computer.rdp_configured ? "✓ password set" : "no password set"}
              </span>
            </div>
            <p style={{ margin: "4px 0 10px", fontSize: 11, color: D.sub }}>
              Pre-populate credentials for 1-click connect.
              <strong style={{ color: D.cyan }}> RDP</strong> uses Windows accounts (Pro/Enterprise only).
              <strong style={{ color: D.cyan }}> VNC</strong> uses a separate password set when you install
              the VNC server (e.g. <a href="https://www.tightvnc.com/download.php" target="_blank" rel="noreferrer" style={{ color: D.cyan }}>TightVNC</a>) — works on every Windows edition.
            </p>

            {/* Protocol toggle */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[
                { v: "rdp", label: "RDP" },
                { v: "vnc", label: "VNC" },
              ].map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => {
                    setRemoteProtocol(opt.v);
                    // Flip the default port when switching, but only if it
                    // looks like the previous default (don't clobber custom).
                    if (opt.v === "vnc" && Number(rdpPort) === 3389) setRdpPort(5900);
                    if (opt.v === "rdp" && Number(rdpPort) === 5900) setRdpPort(3389);
                  }}
                  style={{
                    flex: 1, padding: "8px 10px", borderRadius: 7,
                    border: remoteProtocol === opt.v ? `1px solid ${D.cyan}` : "1px solid rgba(255,255,255,.12)",
                    background: remoteProtocol === opt.v ? "rgba(34,211,238,.10)" : "transparent",
                    color: remoteProtocol === opt.v ? D.cyan : D.ink,
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: remoteProtocol === "vnc" ? "1fr 90px" : "1.5fr 1.5fr 90px", gap: 12 }}>
              {remoteProtocol === "rdp" ? (
                <div>
                  <label style={labelStyle}>Windows username</label>
                  <input
                    value={rdpUsername}
                    onChange={(e) => setRdpUsername(e.target.value)}
                    placeholder="tbn-admin"
                    style={inputStyle}
                  />
                </div>
              ) : null}
              <div>
                <label style={labelStyle}>{remoteProtocol === "vnc" ? "VNC password" : "Windows password"}</label>
                <input
                  type="password"
                  value={rdpPassword}
                  onChange={(e) => setRdpPassword(e.target.value)}
                  placeholder={computer.rdp_configured ? "(leave blank to keep current)" : "(set in your VNC server install)"}
                  style={inputStyle}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label style={labelStyle}>Port</label>
                <input
                  type="number" min="1" max="65535"
                  value={rdpPort}
                  onChange={(e) => setRdpPort(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Source folders */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: 13, fontWeight: 700 }}>Source folders ({rows.length})</h3>
              <button
                onClick={addRow}
                style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(103,232,249,.32)", background: "rgba(34,211,238,.10)", color: D.cyan, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <UI name="plus" size={12} /> Add Source
              </button>
            </div>

            {rows.length === 0 ? (
              <div style={{ padding: 16, borderRadius: 10, background: "rgba(0,0,0,.18)", color: D.sub, fontSize: 12, textAlign: "center" }}>
                No source folders yet.
              </div>
            ) : (
              rows.map((r, i) => (
                <div key={r.id ?? `new-${i}`} style={{ marginBottom: 12, padding: 14, borderRadius: 12, background: "rgba(0,0,0,.18)", border: "1px solid rgba(255,255,255,.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        value={r.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        placeholder="Job name"
                        style={{ ...inputStyle, fontFamily: "Geist", fontWeight: 700, width: 240 }}
                      />
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: D.sub, cursor: "pointer" }}>
                        <input type="checkbox" checked={r.enabled} onChange={(e) => updateRow(i, { enabled: e.target.checked })} />
                        Enabled
                      </label>
                    </div>
                    <button
                      onClick={() => removeRow(i)}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.bad, cursor: "pointer", display: "grid", placeItems: "center" }}
                    >
                      <UI name="trash" size={11} />
                    </button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Source path</label>
                      <input value={r.source_folder_path} onChange={(e) => updateRow(i, { source_folder_path: e.target.value })} placeholder="C:/Users/.../Data" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Target path</label>
                      <input value={r.target_folder_path} onChange={(e) => updateRow(i, { target_folder_path: e.target.value })} placeholder={"\\\\NAS\\share\\..."} style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label style={labelStyle}>Sync direction</label>
                    <select value={r.sync_direction || "one-way"} onChange={(e) => updateRow(i, { sync_direction: e.target.value })} style={{ ...inputStyle, fontFamily: "Geist" }}>
                      {DIRECTION_OPTIONS.map((o) => (
                        <option key={o.v} value={o.v} style={{ background: D.panel }}>{o.label}</option>
                      ))}
                    </select>
                    {(r.sync_direction === "mirror" || r.sync_direction === "move") ? (
                      <div style={{ marginTop: 4, fontSize: 10, color: D.warn }}>
                        ⚠ {r.sync_direction === "mirror" ? "Deletes target files when removed from source." : "Deletes source files after copy. Verify target is reachable."}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 1fr", gap: 10, marginTop: 10 }}>
                    <div>
                      <label style={labelStyle}>Conflict mode</label>
                      <select value={r.conflict_handling} onChange={(e) => updateRow(i, { conflict_handling: e.target.value })} style={{ ...inputStyle, fontFamily: "Geist" }}>
                        {CONFLICT_OPTIONS.map((o) => (
                          <option key={o.v} value={o.v} style={{ background: D.panel }}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Watch delay (s)</label>
                      <input
                        type="number"
                        min="0"
                        value={r.watch_mode_delay_seconds}
                        onChange={(e) => updateRow(i, { watch_mode_delay_seconds: e.target.value, watch_mode_enabled: true })}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Full sync (cron)</label>
                      <input
                        value={r.schedule_cron ?? ""}
                        onChange={(e) => updateRow(i, { schedule_cron: e.target.value })}
                        placeholder="0 6 * * *"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <button
            onClick={removeInstrument}
            disabled={saving}
            title="Remove this instrument from the dashboard. It re-registers if its agent calls in again."
            style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid rgba(251,113,133,.3)", background: "transparent", color: D.bad, fontSize: 12, fontWeight: 600, cursor: saving ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <UI name="trash" size={12} /> Remove instrument
          </button>
          {error ? (
            <div style={{ color: D.bad, fontSize: 12, flex: 1, textAlign: "center" }}>{error}</div>
          ) : <div style={{ flex: 1 }} />}
          <button
            onClick={onClose}
            style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: D.ink, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})`, color: "#052432", fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
