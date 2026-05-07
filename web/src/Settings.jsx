import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { UI } from "./icons";
import UsersSection from "./UsersSection";
import InstrumentTypesSection from "./InstrumentTypesSection";
import HelpSection from "./HelpSection";
import ConnectionsSection from "./ConnectionsSection";
import InstrumentConfig from "./InstrumentConfig";
import { ICON_LABELS } from "./theme";
import { InstIcon } from "./icons";

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(0,0,0,.30)",
  color: "#fff",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};
const monoInput = { ...inputStyle, fontFamily: "Geist Mono", fontSize: 12 };
const labelStyle = { fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 6 };

function ToggleSwitch({ on, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{ width: 32, height: 18, borderRadius: 999, background: on ? D.cyan : "rgba(255,255,255,.10)", position: "relative", cursor: "pointer", justifySelf: "end", transition: "background .15s" }}
    >
      <div style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: "#fff", transition: "all .2s" }} />
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 22, marginBottom: 14 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#fff" }}>{title}</h2>
      {subtitle ? <p style={{ margin: "0 0 18px", fontSize: 12, color: D.sub }}>{subtitle}</p> : null}
      {children}
    </div>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,.05)", alignItems: "start" }}>
      <div>
        <div style={{ fontSize: 12, color: D.ink, fontWeight: 600 }}>{label}</div>
        {hint ? <div style={{ fontSize: 10, color: D.faint, marginTop: 3 }}>{hint}</div> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function ToggleRow({ label, hint, on, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 60px", gap: 14, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,.05)", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 12, color: D.ink, fontWeight: 600 }}>{label}</div>
        {hint ? <div style={{ fontSize: 10, color: D.faint, marginTop: 2 }}>{hint}</div> : null}
      </div>
      <ToggleSwitch on={on} onChange={onChange} />
    </div>
  );
}

export default function Settings() {
  const [s, setS] = useState(null);
  const [orig, setOrig] = useState(null);
  const [logoStamp, setLogoStamp] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const fileRef = useRef(null);

  async function testWebhook() {
    setTesting(true);
    setTestMsg("");
    try {
      const r = await api.testNotify();
      setTestMsg(r.detail ? `✓ ${r.detail}` : "✓ delivered");
    } catch (err) {
      setTestMsg(`✕ ${err.message}`);
    } finally {
      setTesting(false);
      setTimeout(() => setTestMsg(""), 4000);
    }
  }

  useEffect(() => {
    api.settings()
      .then((data) => { setS(data); setOrig(data); })
      .catch((err) => setError(err.message));
  }, []);

  function patch(field, value) {
    setS((cur) => ({ ...cur, [field]: value }));
  }

  const dirty = orig && JSON.stringify(s) !== JSON.stringify(orig);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const r = await api.updateSettings(s);
      setS(r);
      setOrig(r);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onLogoChosen(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    try {
      await api.uploadLogo(f);
      const fresh = await api.settings();
      setS(fresh);
      setOrig(fresh);
      setLogoStamp(Date.now());
      // Bump browser favicon too
      const link = document.querySelector("link[rel='icon']");
      if (link) link.href = `/api/settings/logo?t=${Date.now()}`;
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  }

  async function clearLogo() {
    if (!window.confirm("Remove the lab logo?")) return;
    try {
      await api.deleteLogo();
      const fresh = await api.settings();
      setS(fresh);
      setOrig(fresh);
      setLogoStamp(Date.now());
    } catch (err) {
      setError(err.message);
    }
  }

  if (!s) {
    return (
      <div style={{ padding: 32, color: D.sub }}>
        {error ? `Error: ${error}` : "Loading settings…"}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", paddingBottom: 80 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, color: D.cyan, fontWeight: 700, letterSpacing: ".12em" }}>SYNC MANAGER / SETTINGS</div>
        <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-.02em" }}>Settings</h1>
        <div style={{ fontSize: 12, color: D.sub, marginTop: 3 }}>
          Lab-wide configuration. Changes persist on Save.
        </div>
      </div>

      {/* Identity */}
      <Card title="Identity" subtitle="Shown in the sidebar and used as the browser favicon.">
        <FieldRow label="Site name">
          <input value={s.lab_name} onChange={(e) => patch("lab_name", e.target.value)} style={inputStyle} />
        </FieldRow>
        <FieldRow
          label="Dashboard heading"
          hint='Title shown above the device cards on the main dashboard. Blank = "Lab Overview".'
        >
          <input
            value={s.dashboard_heading || ""}
            onChange={(e) => patch("dashboard_heading", e.target.value)}
            placeholder="Lab Overview"
            style={inputStyle}
          />
        </FieldRow>
        <FieldRow label="Logo" hint="PNG / JPG / SVG · max 2 MB · square works best">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: 12, background: "rgba(0,0,0,.3)", border: "1px dashed rgba(255,255,255,.12)", display: "grid", placeItems: "center", overflow: "hidden" }}>
              {s.has_logo ? (
                <img src={`/api/settings/logo?t=${logoStamp}`} alt="logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ color: D.faint, fontSize: 10 }}>none</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/*" onChange={onLogoChosen} style={{ display: "none" }} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(103,232,249,.32)", background: "rgba(34,211,238,.10)", color: D.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <UI name="download" size={12} /> {s.has_logo ? "Replace" : "Upload"}
            </button>
            {s.has_logo ? (
              <button
                onClick={clearLogo}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.bad, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <UI name="trash" size={12} /> Remove
              </button>
            ) : null}
          </div>
        </FieldRow>
      </Card>

      {/* Storage */}
      <Card title="Storage" subtitle="The default network root for new sync targets. Per-job paths still override.">
        <FieldRow label="Central storage path" hint="UNC path or mount point — e.g. \\<NAS>\Share\Databased">
          <input value={s.central_storage_path} onChange={(e) => patch("central_storage_path", e.target.value)} placeholder="\\\\NAS\\share\\..." style={monoInput} />
        </FieldRow>
        <FieldRow label="Pause syncs at" hint="Stop new syncs when central storage exceeds this %. Auto-resumes when freed. 0 = disabled.">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number" min="0" max="100"
              value={s.pause_at_storage_pct ?? 0}
              onChange={(e) => patch("pause_at_storage_pct", parseInt(e.target.value, 10) || 0)}
              style={{ ...inputStyle, width: 100 }}
            />
            <span style={{ color: D.sub, fontSize: 12 }}>%</span>
          </div>
        </FieldRow>
      </Card>

      {/* Devices first — admin's at-a-glance view of every PC/server/instrument. */}
      <InstrumentsSection />

      {/* Users + Instrument Types side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <UsersSection />
        <InstrumentTypesSection />
      </div>

      {/* Fleet — admin-only fleet operations */}
      <FleetSection />

      {/* Connections — external integrations (Git, Slack, Box, Dropbox) */}
      <ConnectionsSection
        settings={s}
        patch={patch}
        save={save}
        dirty={dirty}
      />

      {/* Help reference — commands future-you will forget */}
      <HelpSection />

      {/* Save bar */}
      <div style={{ position: "sticky", bottom: 0, marginTop: 18, padding: "12px 16px", background: "rgba(6,17,27,0.92)", border: D.glassBorder, borderRadius: 12, display: "flex", alignItems: "center", gap: 12, backdropFilter: "blur(8px)" }}>
        {error ? (
          <div style={{ color: D.bad, fontSize: 12, flex: 1 }}>{error}</div>
        ) : dirty ? (
          <div style={{ color: D.warn, fontSize: 12, flex: 1 }}>Unsaved changes</div>
        ) : savedAt ? (
          <div style={{ color: D.ok, fontSize: 12, flex: 1 }}>Saved.</div>
        ) : <div style={{ flex: 1 }} />}
        <button
          onClick={() => { setS(orig); setError(""); }}
          disabled={!dirty || saving}
          style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: dirty ? D.ink : D.faint, fontSize: 12, fontWeight: 600, cursor: dirty ? "pointer" : "default" }}
        >
          Discard
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: dirty ? `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})` : "rgba(255,255,255,.06)", color: dirty ? "#052432" : D.faint, fontSize: 12, fontWeight: 700, cursor: dirty && !saving ? "pointer" : "default" }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}


function shortRel(iso) {
  if (!iso) return "never";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.round(d)}s`;
  if (d < 3600) return `${Math.round(d / 60)}m`;
  if (d < 86400) return `${Math.round(d / 3600)}h`;
  return `${Math.round(d / 86400)}d`;
}

function summarizeJobs(jobs) {
  if (!jobs || !jobs.length) return { count: 0, dirs: "" };
  const dirs = new Set(jobs.map((j) => j.sync_direction || "one-way"));
  // Compact label: 'mirror', '1way', 'mixed'
  let label = "—";
  if (dirs.size > 1) label = "mixed";
  else if (dirs.has("mirror")) label = "mirror";
  else if (dirs.has("move")) label = "move";
  else label = "1-way";
  return { count: jobs.length, dirs: label };
}

const COLS = "26px 1fr 80px 110px 90px 70px 60px 110px 90px 90px";

function InstrumentsSection() {
  const [computers, setComputers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [configuring, setConfiguring] = useState(null);

  async function refresh() {
    try {
      const [cs, js] = await Promise.all([api.computers(), api.jobs()]);
      setComputers(cs); setJobs(js);
    } catch { /* ignore */ }
  }
  useEffect(() => { refresh(); }, []);

  const approved = computers.filter((c) => c.status === "approved");
  const jobsByComputer = useMemo(() => {
    const m = {};
    for (const j of jobs) (m[j.source_computer_id] ||= []).push(j);
    return m;
  }, [jobs]);

  return (
    <div style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 22, marginBottom: 14 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#fff" }}>Devices</h2>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: D.sub }}>
        Admin glance view — every approved device's status, version, remote-desktop protocol, sync setup, and toggles.
        Click <strong style={{ color: D.cyan }}>Configure</strong> for the full gear modal.
      </p>
      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,.06)", overflow: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 10, padding: "10px 14px", background: "rgba(0,0,0,.18)", fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, minWidth: 880 }}>
          <span></span>
          <span>Name</span>
          <span>Kind</span>
          <span>Type</span>
          <span>Status</span>
          <span>Version</span>
          <span>Remote</span>
          <span>Flags</span>
          <span>Sync</span>
          <span style={{ textAlign: "right" }}>Actions</span>
        </div>
        {approved.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: D.sub, fontSize: 12 }}>No approved devices yet.</div>
        ) : approved.map((c) => {
          const protoUp = (c.remote_protocol || "vnc").toUpperCase();
          const watched = (c.watch_processes || "").split(",").map((s) => s.trim()).filter(Boolean).length;
          const jb = summarizeJobs(jobsByComputer[c.id]);
          return (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 10, padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.05)", alignItems: "center", fontSize: 12, minWidth: 880 }}>
              <span style={{ display: "grid", placeItems: "center", color: D.sub }}>
                <InstIcon type={c.icon_type} size={20} color={D.sub} accent={D.cyan} />
              </span>
              <span style={{ color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
              <span style={{ color: D.cyan, fontSize: 10, fontFamily: "Geist Mono", textTransform: "uppercase", letterSpacing: ".06em" }}>
                {(c.device_kind || "pc")}
              </span>
              <span style={{ color: D.sub, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ICON_LABELS[c.icon_type] ?? c.icon_type ?? "—"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "Geist Mono" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: c.is_online ? D.ok : D.bad }} />
                <span style={{ color: c.is_online ? D.ok : D.bad }}>{c.is_online ? "online" : "offline"}</span>
                <span style={{ color: D.faint }}>· {shortRel(c.last_heartbeat)}</span>
              </span>
              <span style={{ fontFamily: "Geist Mono", fontSize: 10, color: c.agent_version ? D.ink : D.faint }}>
                {c.agent_version ? `v${c.agent_version}` : "—"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ padding: "2px 6px", borderRadius: 4, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, fontSize: 9, fontWeight: 700, fontFamily: "Geist Mono" }}>
                  {protoUp}
                </span>
                {c.rdp_configured ? (
                  <span title="Remote credentials saved" style={{ color: D.ok, fontSize: 12 }}>✓</span>
                ) : null}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                {c.is_file_server ? (
                  <span title="File server" style={{ padding: "2px 5px", borderRadius: 4, background: "rgba(74,222,128,.16)", border: "1px solid rgba(74,222,128,.32)", color: D.ok, fontSize: 9, fontWeight: 700, fontFamily: "Geist Mono" }}>FS</span>
                ) : null}
                {c.internet_enabled ? (
                  <span title="Internet tunnel ON" style={{ color: D.cyan, fontSize: 12 }}>📶</span>
                ) : null}
                {watched > 0 ? (
                  <span title={`${watched} watched process${watched === 1 ? "" : "es"}`} style={{ color: D.ink, fontSize: 9, fontFamily: "Geist Mono" }}>
                    👁 {watched}
                  </span>
                ) : null}
                {!c.is_file_server && !c.internet_enabled && watched === 0 ? (
                  <span style={{ color: D.faint, fontSize: 10 }}>—</span>
                ) : null}
              </span>
              <span style={{ fontSize: 10, fontFamily: "Geist Mono", color: D.sub }}>
                {jb.count > 0 ? (
                  <>
                    <span style={{ color: D.ink }}>{jb.count}</span>
                    <span style={{ color: D.faint }}> · {jb.dirs}</span>
                  </>
                ) : <span style={{ color: D.faint }}>0</span>}
              </span>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setConfiguring(c)}
                  style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: D.ink, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {configuring ? (
        <InstrumentConfig
          computer={configuring}
          onClose={() => setConfiguring(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}


function PerPcPathList({ computers, centralPath, onChanged }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const approved = computers.filter((c) => c.status === "approved");

  function startEdit(c) {
    setEditingId(c.id);
    setDraft(c.update_source_path || "");
  }

  async function save(c) {
    if (saving) return;
    setSaving(true);
    try {
      // Empty string clears the override → agent inherits lab default.
      await api.updateComputer(c.id, { update_source_path: draft.trim() });
      setEditingId(null);
      onChanged?.();
    } catch (err) {
      // Surface error inline; keep edit open so the user can fix.
      window.alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (approved.length === 0) {
    return <div style={{ fontSize: 11, color: D.faint }}>No approved agents.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {approved.map((c) => {
        const override = (c.update_source_path || "").trim();
        const effective = override || centralPath || "(none — agent uses local agent.json)";
        const isEditing = editingId === c.id;
        return (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 10, alignItems: "center", fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <span style={{ color: D.ink, fontWeight: 600 }}>{c.name}</span>
            {isEditing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save(c);
                  if (e.key === "Escape") setEditingId(null);
                }}
                placeholder="(blank = inherit lab default)"
                style={{ ...monoInput, padding: "5px 8px", fontSize: 11 }}
              />
            ) : (
              <span
                style={{ fontFamily: "Geist Mono", fontSize: 10, color: override ? D.cyan : D.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={`${effective}\n${override ? "(per-PC override)" : "(lab default)"}`}
              >
                {override ? "↳ " : ""}{effective}
              </span>
            )}
            {isEditing ? (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => save(c)}
                  disabled={saving}
                  title="Save (Enter)"
                  style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, cursor: "pointer", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700 }}
                >
                  ✓
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  title="Cancel (Esc)"
                  style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.sub, cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <UI name="x" size={11} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => startEdit(c)}
                title={override ? "Edit override" : "Set per-PC override"}
                style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.ink, cursor: "pointer", display: "grid", placeItems: "center" }}
              >
                <UI name="edit" size={11} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}


function FleetSection() {
  const [computers, setComputers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [savingPath, setSavingPath] = useState(false);
  const [centralPath, setCentralPath] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.computers().then(setComputers).catch(() => {});
    api.settings().then((s) => { setSettings(s); setCentralPath(s.central_build_path || ""); }).catch(() => {});
  }, []);

  const approvedCount = computers.filter((c) => c.status === "approved").length;
  const pathDirty = settings && centralPath !== (settings.central_build_path || "");

  async function saveCentralPath() {
    setSavingPath(true);
    try {
      const r = await api.updateSettings({ central_build_path: centralPath });
      setSettings(r);
    } catch (err) {
      setMsg(`✕ ${err.message}`);
      setTimeout(() => setMsg(""), 4000);
    } finally {
      setSavingPath(false);
    }
  }

  async function pushAll() {
    if (!window.confirm(`Push update check to all ${approvedCount} approved agent(s)? Each will pull the newest build from the NAS within seconds.`)) return;
    setPushing(true); setMsg("");
    try {
      const r = await api.pushAgentUpdateAll();
      setMsg(`✓ Pushed to ${r.count} agent(s).`);
    } catch (err) {
      setMsg(`✕ ${err.message}`);
    } finally {
      setPushing(false);
      setTimeout(() => setMsg(""), 4000);
    }
  }

  return (
    <Card title="Fleet" subtitle="Cross-instrument actions and the canonical build location.">
      <FieldRow
        label="Central build path"
        hint="Where you upload new agent builds. Pi pushes this to every agent on next config poll; per-PC overrides live in each instrument's gear modal."
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text"
            value={centralPath}
            onChange={(e) => setCentralPath(e.target.value)}
            placeholder={"\\\\<NAS>\\Share\\Databased\\Agent\\databased-agent"}
            style={{ ...monoInput, flex: 1 }}
          />
          <button
            onClick={saveCentralPath}
            disabled={!pathDirty || savingPath}
            style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${D.accentBorder}`, background: pathDirty ? D.accentBg : "transparent", color: pathDirty ? D.cyan : D.faint, fontSize: 12, fontWeight: 700, cursor: pathDirty && !savingPath ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
          >
            {savingPath ? "Saving…" : "Save"}
          </button>
        </div>
      </FieldRow>
      <FieldRow
        label="Per-PC pull paths"
        hint="What each agent pulls from. Pencil to override (blank = inherit lab default)."
      >
        <PerPcPathList
          computers={computers}
          centralPath={settings?.central_build_path || ""}
          onChanged={() => api.computers().then(setComputers).catch(() => {})}
        />
      </FieldRow>
      <FieldRow
        label="Push update to all"
        hint={`${approvedCount} approved agent${approvedCount === 1 ? "" : "s"}. Each checks its configured source for a newer build within seconds.`}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={pushAll}
            disabled={pushing || approvedCount === 0}
            style={{ padding: "9px 14px", borderRadius: 8, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, fontSize: 12, fontWeight: 700, cursor: (pushing || approvedCount === 0) ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            {pushing ? "Pushing…" : "Push update"}
          </button>
          {msg ? (
            <span style={{ fontSize: 11, color: msg.startsWith("✓") ? D.ok : D.bad, fontFamily: "Geist Mono" }}>{msg}</span>
          ) : null}
        </div>
      </FieldRow>
      <FieldRow
        label="Add a new instrument PC"
        hint="One-time setup per machine. After approval, future updates flow over the air."
      >
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: D.ink, lineHeight: 1.7 }}>
          <li>Copy <code style={{ color: D.cyan, fontFamily: "Geist Mono" }}>databased-agent\</code> from the build share to the new PC.</li>
          <li>Double-click <code style={{ color: D.cyan, fontFamily: "Geist Mono" }}>databased-agent.exe</code> — wizard appears.</li>
          <li>Fill in Pi URL, computer name, source/target folders.</li>
          <li>The agent registers as <strong style={{ color: D.cyan }}>Pending</strong> on the dashboard.</li>
          <li>Approve from the Pending Approval panel.</li>
        </ol>
      </FieldRow>
    </Card>
  );
}
