import { useEffect, useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { UI } from "./icons";

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

const CONFLICT_OPTIONS = [
  { v: "skip-if-same-size", label: "Skip if same name + size (recommended)" },
  { v: "skip", label: "Skip if exists" },
  { v: "version-number", label: "Append _v1, _v2…" },
  { v: "timestamp-suffix", label: "Append timestamp" },
];

const DIRECTION_OPTIONS = [
  { v: "one-way", label: "One-way · add + update (default)" },
  { v: "mirror", label: "One-way · mirror (delete from target if removed from source)" },
  { v: "move", label: "One-way · move (copy then delete source)" },
];


export default function JobModal({ job, computers, onClose, onSaved }) {
  const isNew = !job?.id;
  const [name, setName] = useState(job?.name ?? "");
  const [computerId, setComputerId] = useState(job?.source_computer_id ?? (computers[0]?.id ?? ""));
  const [source, setSource] = useState(job?.source_folder_path ?? "");
  const [target, setTarget] = useState(job?.target_folder_path ?? "");
  const [conflict, setConflict] = useState(job?.conflict_handling ?? "skip-if-same-size");
  const [direction, setDirection] = useState(job?.sync_direction ?? "one-way");
  const [watchEnabled, setWatchEnabled] = useState(job?.watch_mode_enabled ?? true);
  const [watchDelay, setWatchDelay] = useState(job?.watch_mode_delay_seconds ?? 60);
  const [cron, setCron] = useState(job?.schedule_cron ?? "0 6 * * *");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!name || !computerId || !source || !target) {
      setError("name, instrument, source, and target are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name,
        source_computer_id: Number(computerId),
        source_folder_path: source,
        target_folder_path: target,
        conflict_handling: conflict,
        sync_direction: direction,
        watch_mode_enabled: watchEnabled,
        watch_mode_delay_seconds: Number(watchDelay) || 60,
        schedule_cron: cron || null,
      };
      if (isNew) {
        await api.createJob(payload);
      } else {
        await api.updateJob(job.id, payload);
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
      style={{ position: "fixed", inset: 0, background: "rgba(2,8,17,0.78)", backdropFilter: "blur(6px)", zIndex: 100, display: "grid", placeItems: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 100%)", maxHeight: "90vh", overflow: "auto", background: D.glass, border: D.glassBorder, borderRadius: 18, boxShadow: "0 30px 90px rgba(0,0,0,.55)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: D.cyan, fontWeight: 700, letterSpacing: ".12em" }}>SYNC JOB</div>
            <h2 style={{ margin: "2px 0 0", color: "#fff", fontSize: 18, fontWeight: 700 }}>{isNew ? "New sync job" : `Edit · ${job.name}`}</h2>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.sub, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <UI name="x" size={14} />
          </button>
        </div>

        <div style={{ padding: "18px 22px", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Job name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Orbitrap nightly mirror" style={{ ...inputStyle, fontFamily: "Geist" }} />
            </div>
            <div>
              <label style={labelStyle}>Source instrument</label>
              <select value={computerId} onChange={(e) => setComputerId(e.target.value)} style={{ ...inputStyle, fontFamily: "Geist" }}>
                {computers.length === 0 ? <option value="">No approved instruments</option> : null}
                {computers.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: D.panel }}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Source folder (on the agent's machine)</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="C:/Users/.../Data" style={inputStyle} />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Target folder (network share)</label>
            <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder={"\\\\NAS\\share\\..."} style={inputStyle} />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Sync direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ ...inputStyle, fontFamily: "Geist" }}>
              {DIRECTION_OPTIONS.map((o) => (
                <option key={o.v} value={o.v} style={{ background: D.panel }}>{o.label}</option>
              ))}
            </select>
            {direction === "mirror" ? (
              <div style={{ marginTop: 6, fontSize: 11, color: D.warn }}>
                ⚠ Mirror deletes target files when removed from source. Test on a small folder first.
              </div>
            ) : null}
            {direction === "move" ? (
              <div style={{ marginTop: 6, fontSize: 11, color: D.warn }}>
                ⚠ Move deletes source files after copying. Verify target is reachable before enabling.
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 90px 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Conflict mode</label>
              <select value={conflict} onChange={(e) => setConflict(e.target.value)} style={{ ...inputStyle, fontFamily: "Geist" }}>
                {CONFLICT_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v} style={{ background: D.panel }}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Watch delay (s)</label>
              <input type="number" min="0" value={watchDelay} onChange={(e) => { setWatchDelay(e.target.value); setWatchEnabled(true); }} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Full sync cron</label>
              <input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 6 * * *" style={inputStyle} />
            </div>
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12, color: D.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={watchEnabled} onChange={(e) => setWatchEnabled(e.target.checked)} style={{ accentColor: D.cyan }} />
            Watch source folder for new files
          </label>

          {isNew ? (
            <div style={{ marginTop: 14, padding: "8px 10px", borderRadius: 8, background: "rgba(34,211,238,.08)", border: "1px solid rgba(103,232,249,.20)", fontSize: 11, color: D.sub }}>
              New jobs land in <strong style={{ color: D.cyan }}>Pending Review</strong> on the dashboard — the agent scans the source folder so you can sanity-check size before enabling.
            </div>
          ) : null}
        </div>

        <div style={{ padding: "14px 22px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          {error ? <div style={{ color: D.bad, fontSize: 12, flex: 1 }}>{error}</div> : <div style={{ flex: 1 }} />}
          <button onClick={onClose} style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: D.ink, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})`, color: "#052432", fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer" }}>
            {saving ? "Saving…" : isNew ? "Create job" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
