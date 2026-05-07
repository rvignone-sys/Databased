// Shared frame: full-width top bar + (sidebar | main). The view-specific
// content goes in `children`.
import { useEffect, useState } from "react";
import { api } from "../api";
import { D } from "../theme";
import { UI } from "../icons";
import Resources from "../Resources";
import RdpModal from "../RdpModal";

function FileServerPanel() {
  const [fs, setFs] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const cs = await api.computers();
        if (!alive) return;
        const approved = (cs || []).filter((c) => c.status === "approved");
        setFs(approved.find((c) => c.is_file_server) || null);
        setLoaded(true);
      } catch { /* ignore */ }
    }
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!loaded) return null;
  if (!fs) {
    return (
      <section style={{ background: D.glass, border: `1px solid rgba(250,204,21,.28)`, borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: D.warn, animation: "pulse 1.5s ease-in-out infinite" }} />
          <h2 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: D.warn, letterSpacing: ".02em", textTransform: "uppercase" }}>
            No File Server
          </h2>
        </div>
        <div style={{ fontSize: 11, color: D.sub, lineHeight: 1.5 }}>
          Toggle <span style={{ color: D.cyan, fontWeight: 700 }}>Use as file server</span> in any instrument's gear menu.
        </div>
      </section>
    );
  }
  return (
    <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: D.cyan }}><UI name="server" size={14} /></span>
          File Server <span style={{ color: D.cyan, fontWeight: 600 }}>· {fs.name}</span>
        </h2>
        <span style={{ fontSize: 9, color: fs.is_online ? D.ok : D.bad, fontWeight: 700, letterSpacing: ".06em" }}>
          {fs.is_online ? "ONLINE" : "OFFLINE"}
        </span>
      </div>
      <Resources computerId={fs.id} />
      <StorageDetail computerId={fs.id} />
    </section>
  );
}

function healthBadgeColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "healthy") return D.ok;
  if (s === "warning" || s === "degraded") return D.warn;
  if (!s || s === "unknown") return D.faint;
  return D.bad;
}

function fmtSize(bytes) {
  if (bytes == null) return "—";
  const tb = bytes / 1024 ** 4;
  if (tb >= 1) return `${tb.toFixed(tb >= 10 ? 0 : 1)} TB`;
  const gb = bytes / 1024 ** 3;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

function StorageDetail({ computerId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const m = await api.metrics(computerId);
        if (!alive) return;
        setData(m?.latest?.storage_detail || null);
      } catch { /* ignore */ }
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, [computerId]);

  if (!data) return null;
  const physical = data.physical_disks || [];
  const pools = data.storage_pools || [];
  const virtuals = data.virtual_disks || [];
  if (!physical.length && !pools.length) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.06)" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}
      >
        <span style={{ fontSize: 8, color: D.faint, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block", width: 8, textAlign: "center" }}>▶</span>
        <span style={{ fontSize: 10, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>
          Drives ({physical.length})
        </span>
        {pools.length ? (
          <span style={{ fontSize: 10, color: healthBadgeColor(pools[0]?.HealthStatus), marginLeft: "auto", fontWeight: 700 }}>
            ● {pools[0]?.HealthStatus || "—"}
          </span>
        ) : null}
      </div>

      {open ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {pools.map((p, i) => (
            <div key={`pool-${i}`} style={{ padding: "8px 10px", borderRadius: 8, background: "rgba(0,0,0,.22)", border: "1px solid rgba(255,255,255,.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>Pool · {p.FriendlyName}</span>
                <span style={{ fontSize: 10, color: healthBadgeColor(p.HealthStatus), fontWeight: 700 }}>● {p.HealthStatus}</span>
              </div>
              <div style={{ fontFamily: "Geist Mono", fontSize: 10, color: D.sub, marginTop: 3 }}>
                {fmtSize(p.AllocatedSize)} of {fmtSize(p.Size)} used
                {virtuals[i]?.ResiliencySettingName ? ` · ${virtuals[i].ResiliencySettingName}` : ""}
                {virtuals[i]?.NumberOfColumns ? ` × ${virtuals[i].NumberOfColumns}` : ""}
              </div>
            </div>
          ))}

          {physical.map((d, i) => (
            <div key={`disk-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(0,0,0,.18)", alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.SerialNumber || ""}>
                  {d.FriendlyName || "—"}
                </div>
                <div style={{ fontFamily: "Geist Mono", fontSize: 9, color: D.faint, marginTop: 2 }}>
                  {d.MediaType || "—"} · {d.BusType || "—"}
                  {d.SpindleSpeed ? ` · ${d.SpindleSpeed} rpm` : ""}
                </div>
              </div>
              <div style={{ fontFamily: "Geist Mono", fontSize: 11, color: D.cyan, textAlign: "right" }}>
                {fmtSize(d.Size)}
              </div>
              <div style={{ fontSize: 9, color: healthBadgeColor(d.HealthStatus), fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", textAlign: "right" }}>
                ● {d.HealthStatus || "—"}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StatusDot({ color, pulse }) {
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: 999,
        background: color,
        display: "inline-block",
        boxShadow: `0 0 0 3px ${color}22`,
        animation: pulse ? "pulse 2s ease-in-out infinite" : "none",
      }}
    />
  );
}

export function LiveBar({ pct, color = D.cyan }) {
  return (
    <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,.07)", overflow: "hidden", position: "relative" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${D.cyan})`, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,.4), transparent)",
            backgroundSize: "200% 100%",
            animation: "shimmer 1.6s linear infinite",
          }}
        />
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, badge, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 12px",
        borderRadius: 10,
        color: active ? D.navActiveText : D.navInactive,
        background: active ? D.navActiveBg : "transparent",
        border: active ? `1px solid ${D.accentBorder}` : "1px solid transparent",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      <UI name={icon} size={16} />
      <span>{label}</span>
      {badge ? (
        <span
          style={{
            marginLeft: "auto",
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            padding: "0 6px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: D.cyan,
            color: "#052432",
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function SystemStatusPanel({ stats }) {
  if (!stats) {
    return (
      <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 14 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>System Status</h2>
        <div style={{ marginTop: 8, color: D.faint, fontSize: 11 }}>—</div>
      </section>
    );
  }
  const headlineColor = stats.attention ? D.warn : D.ok;
  const headlineText = stats.attention ? "ATTENTION" : "HEALTHY";
  const rows = [
    { l: "Pi Orchestrator", v: "online", c: D.ok },
    { l: "Agents Online", v: `${stats.online} of ${stats.approved}`, c: D.cyan },
    { l: "Pending Approval", v: stats.pending, c: stats.pending ? D.warn : D.ok },
    { l: "Active Jobs", v: `${stats.jobsEnabled} of ${stats.jobsTotal}`, c: D.cyan },
  ];
  return (
    <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>System Status</h2>
        <span style={{ fontSize: 9, color: headlineColor, fontWeight: 700, letterSpacing: ".08em" }}>● {headlineText}</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i === rows.length - 1 ? "none" : "1px solid rgba(255,255,255,.05)" }}>
          <span style={{ fontSize: 11, color: D.sub }}>{r.l}</span>
          <span style={{ fontFamily: "Geist Mono", fontSize: 10, color: r.c }}>{r.v}</span>
        </div>
      ))}
    </section>
  );
}


function PiOrchPanel() {
  return (
    <div style={{ marginTop: "auto", padding: 12, borderRadius: 12, background: "rgba(0,0,0,.22)", border: "1px solid rgba(255,255,255,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase" }}>Pi Orchestrator</span>
        <StatusDot color={D.ok} pulse />
      </div>
      <div style={{ fontFamily: "Geist Mono", fontSize: 12, color: "#fff", marginTop: 6 }}>databased-pi</div>
      <div style={{ fontSize: 10, color: D.sub, marginTop: 2 }}>v0.1.0</div>
    </div>
  );
}

function PiHostPanel({ isAdmin }) {
  // null when the modal is closed; a synthetic "computer-shaped" object
  // when open, so RdpModal can reuse its rendering without being aware
  // that this target is the Pi itself.
  const [vncTarget, setVncTarget] = useState(null);
  // Pi can be xrdp (default) or VNC depending on what's installed; the
  // session payload tells us which so the modal labels itself correctly.
  const [piProto, setPiProto] = useState("rdp");
  return (
    <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>
          Resources <span style={{ color: D.cyan, fontWeight: 600 }}>· Pi Host</span>
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isAdmin ? (
            <button
              onClick={() => setVncTarget({ id: "pi-host", name: "Pi Host" })}
              title="Open VNC to the Pi (in-browser via Guacamole)"
              style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, cursor: "pointer", display: "grid", placeItems: "center" }}
            >
              <UI name="server" size={11} />
            </button>
          ) : null}
          <span style={{ fontSize: 9, color: D.faint, fontFamily: "Geist Mono" }}>2s</span>
        </div>
      </div>
      <Resources host />
      {vncTarget ? (
        <RdpModal
          computer={vncTarget}
          onClose={() => setVncTarget(null)}
          sessionFetcher={() => api.hostVncSession().then((s) => { setPiProto(s.protocol || "rdp"); return s; })}
          protocol={piProto}
        />
      ) : null}
    </section>
  );
}


function Sidebar({ view, setView, badges, systemStats, isAdmin }) {
  return (
    <aside style={{ display: "flex", flexDirection: "column", gap: 14, overflow: "auto", minWidth: 0 }}>
      {/* Nav zone */}
      <nav style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 3 }}>
        <NavItem icon="home" label="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")} />
        <NavItem icon="sync" label="Sync Jobs" active={view === "jobs"} badge={badges.jobs} onClick={() => setView("jobs")} />
        <NavItem icon="logs" label="Logs" active={view === "logs"} onClick={() => setView("logs")} />
        {isAdmin ? (
          <NavItem icon="settings" label="Settings" active={view === "settings"} onClick={() => setView("settings")} />
        ) : null}
      </nav>
      <FileServerPanel />
      <PiHostPanel isAdmin={isAdmin} />
      <SystemStatusPanel stats={systemStats} />
    </aside>
  );
}

function TopBar({ user, onLogout, onRefresh, labName, hasLogo, logoStamp, themeMode, onToggleTheme, onLogoClick }) {
  const initials = (user?.username || "??").slice(0, 2).toUpperCase();
  return (
    <header style={{ background: D.glass, border: D.glassBorder, borderRadius: 18, padding: "10px 16px", display: "flex", alignItems: "center", gap: 14 }}>
      {/* Logo + brand on the left — click logo to jump back to the dashboard. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          onClick={onLogoClick}
          title="Dashboard"
          style={{ width: 38, height: 38, borderRadius: 10, background: D.accentBg, border: `1px solid ${D.accentBorder}`, display: "grid", placeItems: "center", overflow: "hidden", cursor: "pointer" }}
        >
          {hasLogo ? (
            <img src={`/api/settings/logo?t=${logoStamp}`} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 3 L19 7 L19 17 L12 21 L5 17 L5 7 Z" stroke={D.cyan} strokeWidth="1.6" />
              <circle cx="12" cy="12" r="2.5" fill={D.cyan} />
            </svg>
          )}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{labName || "DataBased"}</div>
          <div style={{ fontSize: 9, color: D.cyan, fontWeight: 700, letterSpacing: ".12em", marginTop: 3 }}>SYNC MANAGER</div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Actions on the right */}
      {onRefresh ? (
        <button
          onClick={onRefresh}
          title="Refresh"
          style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: D.ink, cursor: "pointer", display: "grid", placeItems: "center" }}
        >
          <UI name="refresh" size={16} />
        </button>
      ) : null}
      {onToggleTheme ? (
        <button
          onClick={onToggleTheme}
          title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.04)", color: D.ink, cursor: "pointer", display: "grid", placeItems: "center" }}
        >
          <UI name={themeMode === "dark" ? "sun" : "moon"} size={16} />
        </button>
      ) : null}
      <button
        title="Sign out"
        onClick={onLogout}
        style={{ width: 38, height: 38, borderRadius: 10, background: D.accentBg, border: `1px solid ${D.accentBorder}`, display: "grid", placeItems: "center", color: D.cyan, fontWeight: 700, fontSize: 11, cursor: "pointer" }}
      >
        {initials}
      </button>
    </header>
  );
}

export function Shell({ view, setView, badges, user, onLogout, onRefresh, systemStats, isAdmin, themeMode, onToggleTheme, children }) {
  const [labName, setLabName] = useState("DataBased");
  const [hasLogo, setHasLogo] = useState(false);
  const [logoStamp, setLogoStamp] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const s = await api.settings();
        if (!alive) return;
        setLabName(s.lab_name || "DataBased");
        setHasLogo(s.has_logo);
        // Update favicon to use the lab logo
        const link = document.querySelector("link[rel='icon']");
        if (link && s.has_logo) link.href = `/api/settings/logo?t=${Date.now()}`;
      } catch {/* not authed yet — ignore */}
    }
    tick();
    // Refetch when settings might have changed (cheap; runs every 30s)
    const id = setInterval(() => { setLogoStamp(Date.now()); tick(); }, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: D.bg,
        color: D.ink,
        fontFamily: "Geist, system-ui",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 14,
        boxSizing: "border-box",
      }}
    >
      <TopBar user={user} onLogout={onLogout} onRefresh={onRefresh}
              labName={labName} hasLogo={hasLogo} logoStamp={logoStamp}
              themeMode={themeMode} onToggleTheme={onToggleTheme}
              onLogoClick={() => setView("dashboard")} />
      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)", gap: 14, flex: 1, minHeight: 0 }}>
        <Sidebar view={view} setView={setView} badges={badges} systemStats={systemStats} isAdmin={isAdmin} />
        <main style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
