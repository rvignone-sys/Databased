import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { D, ICON_LABELS, healthColor, statusColor, logStatusColor } from "./theme";
import { InstIcon, UI, Spark, SPARKS } from "./icons";
import { StatusDot, LiveBar } from "./components/Shell";
import { shortRelative } from "./format";
import Resources from "./Resources";
import PendingReview from "./PendingReview";
import RdpModal from "./RdpModal";
import CompareModal from "./CompareModal";

function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  try { document.execCommand("copy"); } catch { /* ignore */ }
  document.body.removeChild(ta);
}

function DarkCard({ inst, hovered, selected, onHover, onLeave, onTriggerSync, onCompare, onConfigure, onSelect, onRdp, onToggleInternet, isAdmin, latestAgentVersion }) {
  const versionOk = !latestAgentVersion || (inst.agentVersion && compareVersions(inst.agentVersion, latestAgentVersion) >= 0);
  const hc = healthColor(inst.health);
  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onSelect}
      style={{
        position: "relative",
        borderRadius: 16,
        padding: 14,
        cursor: "pointer",
        border: `1px solid ${selected ? D.borderSelected : hovered ? D.borderHover : D.borderDefault}`,
        background: D.cardBg,
        boxShadow: selected ? D.shadowSelected : hovered ? D.shadowHover : D.shadowCard,
        transition: "all .2s",
        minHeight: 250,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ height: 88, borderRadius: 12, background: "radial-gradient(circle at 50% 40%, rgba(125,249,255,.14), transparent 65%)", display: "grid", placeItems: "center", position: "relative" }}>
        <InstIcon type={inst.icon} size={64} color={D.sub} accent={D.cyan} />
        {hovered ? (
          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onRdp?.(); }}
              title="Remote Desktop (download .rdp)"
              style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid rgba(125,249,255,.35)", background: "transparent", color: D.cyan, cursor: "pointer", display: "grid", placeItems: "center" }}
            >
              <UI name="server" size={13} />
            </button>
            {isAdmin ? (
              <button
                onClick={(e) => { e.stopPropagation(); onCompare?.(); }}
                title="Compare & sync (preview new/changed files first)"
                style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid rgba(125,249,255,.35)", background: "transparent", color: D.cyan, cursor: "pointer", display: "grid", placeItems: "center" }}
              >
                <UI name="search" size={13} />
              </button>
            ) : null}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleInternet?.(); }}
              title={inst.internetEnabled
                ? "Internet tunnel ON for this PC — click to disable. Auto-off after 30 min idle."
                : "Internet tunnel OFF — click to allow this PC through Pi proxy"}
              style={{
                width: 26, height: 26, borderRadius: 7,
                border: `1px solid ${inst.internetEnabled ? D.accentBorder : "rgba(125,249,255,.35)"}`,
                background: inst.internetEnabled ? D.accentBg : "transparent",
                color: inst.internetEnabled ? D.cyan : D.sub,
                cursor: "pointer", display: "grid", placeItems: "center",
              }}
            >
              <UI name="wifi" size={13} />
            </button>
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "3px 8px",
            borderRadius: 999,
            background: inst.status === "online" ? "rgba(74,222,128,.14)" : "rgba(251,113,133,.14)",
            border: `1px solid ${inst.status === "online" ? "rgba(74,222,128,.32)" : "rgba(251,113,133,.32)"}`,
            fontSize: 10,
            fontWeight: 700,
            color: statusColor(inst.status === "online"),
            letterSpacing: ".04em",
            textTransform: "uppercase",
          }}
        >
          <StatusDot color={statusColor(inst.status === "online")} pulse={inst.runActive} />
          {inst.status}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "-.01em" }}>{inst.type}</h3>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <span style={{ fontSize: 10, fontFamily: "Geist Mono", color: D.sub }} title="IP address">{inst.ip ?? "—"}</span>
            {inst.agentVersion ? (
              <span
                title={versionOk ? "Agent up to date" : `Outdated — latest is ${latestAgentVersion}`}
                style={{ fontSize: 9, fontFamily: "Geist Mono", color: versionOk ? D.ok : D.bad }}
              >
                ● v{inst.agentVersion}
              </span>
            ) : (
              <span style={{ fontSize: 9, fontFamily: "Geist Mono", color: D.faint }} title="No version reported yet">v—</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 11, color: D.sub }} title="PC name">{inst.name}</span>
          {inst.activity ? (
            <span
              title={
                inst.activity === "user+data"
                  ? "User input AND new files in the last 5 minutes"
                  : inst.activity === "user"
                    ? "User input in the last 5 minutes"
                    : "New files in the last 5 minutes"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 7px",
                borderRadius: 999,
                background: "rgba(74,222,128,.16)",
                border: "1px solid rgba(74,222,128,.36)",
                color: D.ok,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: ".06em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: 999, background: D.ok, animation: "pulse 1.5s ease-in-out infinite" }} />
              In use
            </span>
          ) : null}
        </div>
      </div>

      {inst.runActive ? (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(34,211,238,.06)", border: "1px solid rgba(103,232,249,.18)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: D.cyan, letterSpacing: ".08em", textTransform: "uppercase" }}>● Syncing</span>
            <span style={{ fontFamily: "Geist Mono", fontSize: 11, color: D.ink }}>{inst.runPct}%</span>
          </div>
          <LiveBar pct={inst.runPct} color={hc} />
        </div>
      ) : (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontSize: 10, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase" }}>{inst.status === "offline" ? "Last contact" : "Last heartbeat"}</div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 12, color: inst.status === "offline" ? D.bad : D.ink, marginTop: 4 }}>{inst.hb}</div>
        </div>
      )}

      <div style={{ marginTop: "auto", paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase" }}>Files 24h</div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 14, fontWeight: 600, color: "#fff" }}>{inst.filesToday}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase" }}>Storage</div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 14, fontWeight: 600, color: D.cyan }}>
            {inst.storage}
            <span style={{ fontSize: 10, color: D.sub }}> GB</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase" }}>Queue</div>
          <div style={{ fontFamily: "Geist Mono", fontSize: 14, fontWeight: 600, color: inst.queue > 0 ? D.warn : "#fff" }}>{inst.queue}</div>
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase" }}>24h activity</span>
        <Spark
          values={inst.activity24h && inst.activity24h.length ? inst.activity24h : [0, 0]}
          w={120}
          h={20}
          stroke={inst.status === "online" && inst.activity24h?.some((v) => v > 0) ? D.cyan : D.faint}
        />
      </div>
    </div>
  );
}

function Dropdown({ icon, label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const current = options.find((o) => o.v === value) ?? options[0];
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "0 12px", height: 32, borderRadius: 8,
          border: "1px solid rgba(255,255,255,.10)",
          background: open ? "rgba(34,211,238,.10)" : "rgba(0,0,0,.18)",
          color: open ? D.cyan : D.ink, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {icon ? <UI name={icon} size={13} /> : null}
        {label ? `${label}: ` : ""}{current?.label ?? value}
        <UI name="chevron" size={12} />
      </button>
      {open ? (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0,
            minWidth: 200, padding: 4, borderRadius: 10,
            background: "rgba(8,19,31,.96)", border: "1px solid rgba(103,232,249,.18)",
            boxShadow: "0 14px 40px rgba(0,0,0,.45)", zIndex: 50,
            backdropFilter: "blur(8px)",
          }}
        >
          {options.map((o) => (
            <div
              key={o.v}
              onClick={() => { onChange(o.v); setOpen(false); }}
              style={{
                padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                color: o.v === value ? D.cyan : D.ink, fontSize: 12,
                background: o.v === value ? "rgba(34,211,238,.10)" : "transparent",
                display: "flex", alignItems: "center", gap: 8,
              }}
              onMouseEnter={(e) => { if (o.v !== value) e.currentTarget.style.background = "rgba(255,255,255,.04)"; }}
              onMouseLeave={(e) => { if (o.v !== value) e.currentTarget.style.background = "transparent"; }}
            >
              {o.label}
              {o.hint ? <span style={{ marginLeft: "auto", fontSize: 10, color: D.faint }}>{o.hint}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}


function ListRow({ inst, selected, isAdmin, onSelect, onTriggerSync, onCompare, onConfigure, onRdp }) {
  const isUser = inst.activity === "user" || inst.activity === "user+data";
  return (
    <div
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "26px 2fr 90px 80px 70px 60px 70px 80px",
        gap: 12,
        alignItems: "center",
        padding: "10px 14px",
        borderRadius: 10,
        background: selected ? "rgba(34,211,238,.06)" : "transparent",
        border: selected ? "1px solid rgba(125,249,255,.4)" : "1px solid rgba(255,255,255,.04)",
        cursor: "pointer",
        marginBottom: 6,
        fontSize: 12,
      }}
    >
      <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(125,249,255,.08)", display: "grid", placeItems: "center" }}>
        <InstIcon type={inst.icon} size={18} color={D.sub} accent={D.cyan} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inst.type}</span>
        <span style={{ color: D.sub, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="PC name">{inst.name}</span>
        <span style={{ color: D.faint, fontFamily: "Geist Mono", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="IP address">{inst.ip ?? "—"}</span>
        {inst.activity ? (
          <span style={{ padding: "2px 6px", borderRadius: 999, background: "rgba(74,222,128,.16)", border: "1px solid rgba(74,222,128,.36)", color: D.ok, fontSize: 9, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: D.ok, animation: "pulse 1.5s ease-in-out infinite" }} />
            in use
          </span>
        ) : null}
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: inst.status === "online" ? D.ok : D.bad, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "currentColor" }} />
        {inst.status}
      </span>
      <span style={{ fontFamily: "Geist Mono", color: D.sub, fontSize: 11 }}>{inst.hb}</span>
      <span style={{ fontFamily: "Geist Mono", color: "#fff", fontSize: 12, textAlign: "right" }}>{inst.filesToday}</span>
      <span style={{ fontFamily: "Geist Mono", color: D.cyan, fontSize: 12, textAlign: "right" }}>{inst.storage}<span style={{ color: D.sub, fontSize: 10 }}> GB</span></span>
      <span style={{ fontFamily: "Geist Mono", color: inst.queue > 0 ? D.warn : D.faint, fontSize: 12, textAlign: "right" }}>{inst.queue}</span>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onRdp?.(); }}
          title="Remote Desktop"
          style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(125,249,255,.30)", background: "transparent", color: D.cyan, cursor: "pointer", display: "grid", placeItems: "center" }}
        >
          <UI name="server" size={12} />
        </button>
        {isAdmin ? (
          <button
            onClick={(e) => { e.stopPropagation(); onCompare?.(); }}
            title="Compare & sync"
            style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(125,249,255,.30)", background: "transparent", color: D.cyan, cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <UI name="search" size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}


function ExpandedFiles({ log, job, onCopy }) {
  const lines = (log.file_list ?? "").split("\n").filter(Boolean).slice(0, 25);
  if (!lines.length) return null;
  const sourceRoot = job?.source_folder_path?.replace(/[\\/]+$/, "") ?? "";
  // Map prefix → glyph + color. + copied, ~ skipped, x failed, - deleted, > moved
  const glyph = { "+": "↑", "~": "↷", "x": "✕", "-": "✕", ">": "→" };
  const tint = { "+": "#86efac", "~": "#cbd5e1", "x": "#fca5a5", "-": "#fca5a5", ">": "#fcd34d" };
  return (
    <div style={{ paddingBottom: 8, marginLeft: 22 }}>
      {lines.map((line, i) => {
        const sym = line[0];
        const path = line.slice(2);
        const absPath = sourceRoot ? `${sourceRoot}/${path}`.replace(/\//g, sourceRoot.includes("\\") ? "\\" : "/") : path;
        return (
          <div
            key={i}
            onClick={() => onCopy?.(absPath)}
            title={`Click to copy: ${absPath}`}
            style={{ display: "flex", gap: 6, padding: "2px 6px", fontFamily: "Geist Mono", fontSize: 10, cursor: "pointer", borderRadius: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 10, color: tint[sym] || "#94a3b8", textAlign: "center" }}>{glyph[sym] || "·"}</span>
            <span style={{ color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
          </div>
        );
      })}
      {(log.file_list ?? "").split("\n").filter(Boolean).length > 25 ? (
        <div style={{ marginTop: 4, fontSize: 10, color: "#94a3b8", fontStyle: "italic" }}>
          … {(log.file_list ?? "").split("\n").filter(Boolean).length - 25} more — see Logs page
        </div>
      ) : null}
    </div>
  );
}


function PendingRow({ pending, approved, onApprove, onAdopt }) {
  const [showAdopt, setShowAdopt] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  async function doAdopt() {
    if (!target) return;
    setBusy(true);
    try { await onAdopt(parseInt(target, 10)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ paddingBottom: 10, borderBottom: "1px solid rgba(255,255,255,.05)", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pending.name}</div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={onApprove}
            title="Add as a new instrument"
            style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid rgba(103,232,249,.32)", background: "rgba(34,211,238,.10)", color: D.cyan, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            Approve
          </button>
          {approved.length ? (
            <button
              onClick={() => setShowAdopt((v) => !v)}
              title="Merge this agent's identity onto an existing instrument (preserves logs + jobs)"
              style={{ padding: "4px 8px", borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: showAdopt ? D.cyan : D.sub, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              Adopt {showAdopt ? "▲" : "▾"}
            </button>
          ) : null}
        </div>
      </div>
      <div style={{ fontSize: 10, color: D.sub, fontFamily: "Geist Mono" }}>
        {pending.ip_address} · {ICON_LABELS[pending.icon_type] ?? pending.icon_type}
      </div>

      {showAdopt ? (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: "rgba(0,0,0,.20)", border: "1px solid rgba(255,255,255,.06)" }}>
          <div style={{ fontSize: 10, color: D.faint, marginBottom: 6, lineHeight: 1.4 }}>
            Replaces the chosen instrument's name with <span style={{ color: D.cyan, fontFamily: "Geist Mono" }}>{pending.name}</span>. Old logs + jobs are kept.
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.30)", color: "#fff", fontSize: 11, fontFamily: "Geist Mono", outline: "none" }}
            >
              <option value="">Choose instrument…</option>
              {approved.map((a) => (
                <option key={a.id} value={a.id} style={{ background: D.panel }}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              onClick={doAdopt}
              disabled={!target || busy}
              style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: target ? `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})` : "rgba(255,255,255,.06)", color: target ? "#052432" : D.faint, fontSize: 11, fontWeight: 700, cursor: target && !busy ? "pointer" : "default" }}
            >
              {busy ? "…" : "Adopt"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function KpiCard({ label, value, sub, accent, spark }) {
  return (
    <div style={{ background: D.glass, border: D.glassBorder, borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 10, color: D.faint, letterSpacing: ".10em", textTransform: "uppercase" }}>{label}</div>
        <Spark values={spark} w={48} h={18} stroke={accent} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", marginTop: 4, letterSpacing: "-.02em" }}>{value}</div>
      <div style={{ fontSize: 11, color: D.sub, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// Adapt API computer record → design's instrument shape.
function adaptComputer(c, runningLogIds, jobsByComputer, logsByComputer) {
  const runningCount = (logsByComputer[c.id] || []).filter((l) => l.status === "running" || l.status === "pending").length;
  const filesToday = (logsByComputer[c.id] || [])
    .filter((l) => l.status === "success" || l.status === "warning")
    .reduce((sum, l) => sum + (l.files_copied || 0), 0);
  return {
    id: c.id,
    name: c.name,
    type: ICON_LABELS[c.icon_type] ?? "Instrument",
    computer: c.name,
    ip: c.ip_address,
    icon: c.icon_type,
    status: c.is_online ? "online" : "offline",
    health: c.is_online ? "good" : "critical",
    hb: c.last_heartbeat ? `${shortRelative(c.last_heartbeat)} ago` : "never",
    storage: c.storage_used_gb != null ? Math.round(c.storage_used_gb) : 0,
    filesToday,
    queue: runningCount,
    runActive: runningCount > 0,
    runPct: runningCount > 0 ? 50 : 0,
    activity: c.activity ?? null,  // computed server-side: null | user | data | user+data
    activity24h: c.activity_24h ?? null,  // 24 hourly buckets normalized 0..1
    agentVersion: c.agent_version || null,
    internetEnabled: !!c.internet_enabled,
  };
}

function compareVersions(a, b) {
  // Numeric semver compare: "0.19.0" vs "0.17.0" → 1. Missing/null → -Infinity.
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export default function Dashboard({ user, onLogout, isAdmin }) {
  const [computers, setComputers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [hov, setHov] = useState(null);
  const [rdpComputer, setRdpComputer] = useState(null);
  const [comparing, setComparing] = useState(null); // { job, computer }
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [toast, setToast] = useState("");
  // Just for the dashboard heading — refreshes lazily so admin name changes
  // propagate without a hard reload.
  const [dashboardHeading, setDashboardHeading] = useState("Lab Overview");
  useEffect(() => {
    let alive = true;
    api.settings()
      .then((s) => { if (alive) setDashboardHeading((s.dashboard_heading || "").trim() || "Lab Overview"); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  // Toolbar state — persisted so refresh keeps your view preferences.
  const [viewMode, setViewMode] = useState(() => localStorage.getItem("databased.viewMode") || "grid");
  const [filterMode, setFilterMode] = useState(() => localStorage.getItem("databased.filterMode") || "all");
  const [sortMode, setSortMode] = useState(() => localStorage.getItem("databased.sortMode") || "status");
  useEffect(() => { localStorage.setItem("databased.viewMode", viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem("databased.filterMode", filterMode); }, [filterMode]);
  useEffect(() => { localStorage.setItem("databased.sortMode", sortMode); }, [sortMode]);

  // Persisted across reloads. Falls back to first approved on first visit.
  const [selectedId, setSelectedIdRaw] = useState(() => {
    const v = localStorage.getItem("databased.selectedId");
    return v ? Number(v) : null;
  });
  function setSelectedId(id) {
    setSelectedIdRaw(id);
    if (id == null) localStorage.removeItem("databased.selectedId");
    else localStorage.setItem("databased.selectedId", String(id));
  }
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [c, j, l] = await Promise.all([api.computers(), api.jobs(), api.logs({ limit: 50 })]);
      setComputers(c);
      setJobs(j);
      setLogs(l);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const approved = useMemo(() => computers.filter((c) => c.status === "approved"), [computers]);
  const pending = useMemo(() => computers.filter((c) => c.status === "pending"), [computers]);

  const logsByComputer = useMemo(() => {
    const out = {};
    for (const l of logs) (out[l.computer_id] ||= []).push(l);
    return out;
  }, [logs]);

  const jobsByComputer = useMemo(() => {
    const out = {};
    for (const j of jobs) (out[j.source_computer_id] ||= []).push(j);
    return out;
  }, [jobs]);

  const instruments = useMemo(
    () => approved.map((c) => adaptComputer(c, [], jobsByComputer, logsByComputer)),
    [approved, jobsByComputer, logsByComputer],
  );

  const onlineCount = approved.filter((c) => c.is_online).length;
  const filesToday = instruments.reduce((s, i) => s + i.filesToday, 0);
  const queued = instruments.reduce((s, i) => s + i.queue, 0);
  // "Current" version = the highest version reported by any agent. Anything
  // below that is shown in red so a partial rollout is visible at a glance.
  const latestAgentVersion = useMemo(() =>
    instruments.reduce((m, i) => compareVersions(i.agentVersion, m) > 0 ? i.agentVersion : m, null),
    [instruments]);

  // Selection is fully explicit — clicking a card toggles. The Resources
  // panel only renders when a card is actively selected.
  const effectiveSelectedId = useMemo(() => {
    if (selectedId && approved.some((c) => c.id === selectedId)) return selectedId;
    return null;
  }, [selectedId, approved]);

  // Apply toolbar filter + sort to the visible instrument list.
  const visibleInstruments = useMemo(() => {
    const fsIds = new Set(approved.filter((c) => c.is_file_server).map((c) => c.id));
    let list = instruments.filter((i) => {
      switch (filterMode) {
        case "online": return i.status === "online";
        case "offline": return i.status === "offline";
        case "in_use": return !!i.activity;
        case "file_server": return fsIds.has(i.id);
        case "all":
        default: return true;
      }
    });
    const heartbeatTime = (id) => {
      const c = approved.find((cc) => cc.id === id);
      return c?.last_heartbeat ? new Date(c.last_heartbeat).getTime() : 0;
    };
    list = [...list].sort((a, b) => {
      switch (sortMode) {
        case "name": return a.name.localeCompare(b.name);
        case "files": return b.filesToday - a.filesToday;
        case "heartbeat": return heartbeatTime(b.id) - heartbeatTime(a.id);
        case "status":
        default: {
          // online first, then in-use, then by name
          const onlineDiff = (b.status === "online") - (a.status === "online");
          if (onlineDiff !== 0) return onlineDiff;
          const useDiff = (b.activity ? 1 : 0) - (a.activity ? 1 : 0);
          if (useDiff !== 0) return useDiff;
          return a.name.localeCompare(b.name);
        }
      }
    });
    return list;
  }, [instruments, filterMode, sortMode, approved]);

  const kpis = [
    { label: "Online", value: `${onlineCount}/${approved.length}`, sub: "instruments", accent: D.ok, spark: [.6, .7, .8, .9, .85, .9, .85] },
    { label: "Files Synced 24h", value: filesToday, sub: pending.length ? `${pending.length} pending approval` : "all approved", accent: D.cyan, spark: [.4, .5, .6, .7, .8, .7, .85] },
    { label: "Active Syncs", value: queued, sub: queued ? "in progress" : "idle", accent: D.warn, spark: [.3, .5, .4, .6, .5, .6, .5] },
    { label: "Jobs Enabled", value: `${jobs.filter((j) => j.enabled).length}/${jobs.length}`, sub: "of total", accent: D.cyan, spark: [.2, .3, .3, .4, .45, .5, .55] },
  ];

  async function triggerForComputer(computerId) {
    const computerJobs = jobsByComputer[computerId] || [];
    if (!computerJobs.length) {
      setError("No jobs configured for this instrument. Create one in Sync Jobs.");
      return;
    }
    try {
      await api.triggerJob(computerJobs[0].id);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function rdpForComputer(computerId) {
    const c = approved.find((cc) => cc.id === computerId);
    if (!c) return;
    if (c.activity) {
      const detail = c.activity === "user+data"
        ? "User input AND new files within the last 5 minutes."
        : c.activity === "user"
          ? "User input within the last 5 minutes."
          : "New files within the last 5 minutes.";
      const ok = window.confirm(
        `${c.name} is currently in use.\n\n${detail}\n\n` +
        `Connecting will mirror their screen — they will see your input. Continue?`
      );
      if (!ok) return;
    }
    setRdpComputer(c);
  }

  function compareForComputer(computerId) {
    const enabled = (jobsByComputer[computerId] || []).filter((j) => j.enabled);
    const jobs = enabled.length ? enabled : (jobsByComputer[computerId] || []);
    if (!jobs.length) {
      setError("No jobs configured for this instrument. Create one in Sync Jobs.");
      return;
    }
    const c = approved.find((cc) => cc.id === computerId);
    setComparing({ job: jobs[0], computer: c });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 14, flex: 1, minHeight: 0 }}>
      <main style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>

        <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 18, padding: 18, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-.02em" }}>{dashboardHeading}</h1>
                {/* Admin actions live in Settings → Fleet (Add instrument + Push update to all) */}
              </div>
              <div style={{ fontSize: 12, color: D.sub, marginTop: 6 }}>
                {approved.length} approved · {onlineCount} online · {queued} syncing
                {pending.length ? ` · ${pending.length} pending` : ""}
                {filterMode !== "all" || sortMode !== "status" ? (
                  <span style={{ color: D.cyan, marginLeft: 6 }}>· showing {visibleInstruments.length}</span>
                ) : null}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["grid", "list"].map((v) => (
                <button
                  key={v}
                  onClick={() => setViewMode(v)}
                  title={v === "grid" ? "Card grid" : "Compact list"}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: viewMode === v ? "rgba(34,211,238,.10)" : "rgba(0,0,0,.18)", color: viewMode === v ? D.cyan : D.sub, cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <UI name={v} size={14} />
                </button>
              ))}
              <Dropdown
                icon="filter"
                value={filterMode}
                onChange={setFilterMode}
                options={[
                  { v: "all", label: "All", hint: `${instruments.length}` },
                  { v: "online", label: "Online only", hint: `${instruments.filter((i) => i.status === "online").length}` },
                  { v: "offline", label: "Offline", hint: `${instruments.filter((i) => i.status === "offline").length}` },
                  { v: "in_use", label: "In use now", hint: `${instruments.filter((i) => i.activity).length}` },
                  { v: "file_server", label: "File server", hint: `${approved.filter((c) => c.is_file_server).length}` },
                ]}
              />
              <Dropdown
                label="Sort"
                value={sortMode}
                onChange={setSortMode}
                options={[
                  { v: "status", label: "Status" },
                  { v: "name", label: "Name (A→Z)" },
                  { v: "files", label: "Files 24h (high→low)" },
                  { v: "heartbeat", label: "Last heartbeat" },
                ]}
              />
            </div>
          </div>

          {error ? (
            <div style={{ color: D.bad, padding: 12, borderRadius: 10, background: "rgba(244,63,94,.10)", marginBottom: 12, fontSize: 12 }}>
              {error}
            </div>
          ) : null}

          {instruments.length === 0 ? (
            <div style={{ padding: 32, borderRadius: 14, background: "rgba(0,0,0,.18)", color: D.sub, textAlign: "center" }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>No instruments yet</div>
              <div style={{ fontSize: 12 }}>
                {pending.length
                  ? `${pending.length} machine(s) pending approval — see the Pending panel on the right.`
                  : "Install the agent on a Windows PC and approve it from the Pending panel."}
              </div>
            </div>
          ) : visibleInstruments.length === 0 ? (
            <div style={{ padding: 32, borderRadius: 14, background: "rgba(0,0,0,.18)", color: D.sub, textAlign: "center", fontSize: 12 }}>
              No instruments match the current filter.
              <button onClick={() => setFilterMode("all")} style={{ marginLeft: 8, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(103,232,249,.32)", background: "rgba(34,211,238,.10)", color: D.cyan, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Clear filter</button>
            </div>
          ) : viewMode === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
              {visibleInstruments.map((i) => (
                <DarkCard
                  key={i.id}
                  inst={i}
                  hovered={hov === i.id}
                  selected={effectiveSelectedId === i.id}
                  isAdmin={isAdmin}
                  latestAgentVersion={latestAgentVersion}
                  onHover={() => setHov(i.id)}
                  onLeave={() => setHov(null)}
                  onSelect={() => setSelectedId(i.id === selectedId ? null : i.id)}
                  onTriggerSync={() => triggerForComputer(i.id)}
                  onCompare={() => compareForComputer(i.id)}
                  onRdp={() => rdpForComputer(i.id)}
                  onToggleInternet={async () => {
                    try { await api.updateComputer(i.id, { internet_enabled: !i.internetEnabled }); await refresh(); }
                    catch (err) { setError(err.message); }
                  }}
                />
              ))}
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "26px 2fr 90px 80px 70px 60px 70px 80px", gap: 12, padding: "0 14px 8px", fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,.05)", marginBottom: 6 }}>
                <span></span><span>Instrument</span><span>Status</span><span>Heartbeat</span><span style={{ textAlign: "right" }}>Files 24h</span><span style={{ textAlign: "right" }}>Storage</span><span style={{ textAlign: "right" }}>Queue</span><span style={{ textAlign: "right" }}>Actions</span>
              </div>
              {visibleInstruments.map((i) => (
                <ListRow
                  key={i.id}
                  inst={i}
                  selected={effectiveSelectedId === i.id}
                  isAdmin={isAdmin}
                  onSelect={() => setSelectedId(i.id === selectedId ? null : i.id)}
                  onTriggerSync={() => triggerForComputer(i.id)}
                  onCompare={() => compareForComputer(i.id)}
                  onRdp={() => rdpForComputer(i.id)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <aside style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, overflow: "hidden" }}>
        {effectiveSelectedId ? (
          <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>
                Resources <span style={{ color: D.cyan, fontWeight: 600 }}>· {(() => { const c = approved.find((cc) => cc.id === effectiveSelectedId); return c ? (ICON_LABELS[c.icon_type] || c.name) : "—"; })()}</span>
              </h2>
              <span style={{ fontSize: 9, color: D.faint, fontFamily: "Geist Mono" }}>2s</span>
            </div>
            <Resources computerId={effectiveSelectedId} />
          </section>
        ) : null}

        {isAdmin ? <PendingReview jobs={jobs} computers={computers} onChange={refresh} /> : null}

        {isAdmin && pending.length ? (
          <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 14 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#fff" }}>Pending Approval</h2>
            {pending.map((c) => (
              <PendingRow
                key={c.id}
                pending={c}
                approved={approved}
                onApprove={async () => {
                  try { await api.approveComputer(c.id); await refresh(); }
                  catch (err) { setError(err.message); }
                }}
                onAdopt={async (existingId) => {
                  try {
                    await api.adoptComputer(existingId, c.id);
                    await refresh();
                  } catch (err) { setError(err.message); }
                }}
              />
            ))}
          </section>
        ) : null}

        <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 14, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>Recent Activity</h2>
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            {logs.length === 0 ? (
              <div style={{ fontSize: 12, color: D.faint }}>No activity yet.</div>
            ) : (
              logs.slice(0, 8).map((l) => {
                const c = logStatusColor(l.status);
                const computer = computers.find((cx) => cx.id === l.computer_id);
                const job = jobs.find((j) => j.id === l.job_id);
                const hasFiles = l.file_list && l.file_list.trim().length > 0;
                const isExpanded = expandedLogId === l.id;
                return (
                  <div key={l.id} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                    <div
                      onClick={() => hasFiles && setExpandedLogId(isExpanded ? null : l.id)}
                      style={{ padding: "8px 0", cursor: hasFiles ? "pointer" : "default" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {hasFiles ? (
                          <span style={{ width: 8, color: D.faint, fontSize: 8, transition: "transform .15s", transform: isExpanded ? "rotate(90deg)" : "none", display: "inline-block", textAlign: "center" }}>▶</span>
                        ) : <span style={{ width: 8 }} />}
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: c, animation: l.status === "running" || l.status === "pending" ? "pulse 1.5s ease-in-out infinite" : "none" }} />
                        <span style={{ fontSize: 12, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job?.name ?? `job #${l.job_id}`}</span>
                        <span style={{ fontFamily: "Geist Mono", fontSize: 10, color: D.faint }}>{shortRelative(l.started_at)}</span>
                      </div>
                      <div style={{ fontFamily: "Geist Mono", fontSize: 10, color: D.sub, marginTop: 2, marginLeft: 22 }}>
                        {computer?.name ?? "—"} · ↑{l.files_copied}{l.files_skipped > 0 ? ` ↷${l.files_skipped}` : ""}{l.files_failed > 0 ? ` ✕${l.files_failed}` : ""} · {l.triggered_by}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ExpandedFiles
                        log={l}
                        job={job}
                        onCopy={(path) => {
                          copyToClipboard(path);
                          setToast(`📋 ${path}`);
                          setTimeout(() => setToast(""), 2000);
                        }}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </aside>


      {rdpComputer ? (
        <RdpModal
          computer={rdpComputer}
          onClose={() => setRdpComputer(null)}
        />
      ) : null}

      {comparing ? (
        <CompareModal
          job={comparing.job}
          computer={comparing.computer}
          isAdmin={isAdmin}
          onSync={async () => { await api.triggerJob(comparing.job.id); await refresh(); }}
          onClose={() => setComparing(null)}
        />
      ) : null}

      {toast ? (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", padding: "10px 16px", borderRadius: 10, background: D.glass, border: D.glassBorder, color: D.ink, fontSize: 12, fontFamily: "Geist Mono", zIndex: 300, boxShadow: "0 8px 24px rgba(0,0,0,.3)" }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
