import React, { useMemo, useState } from "react";

const instruments = [
  {
    name: "Orbitrap",
    type: "LC-HRMS",
    computer: "ORBITRAP-PC",
    status: "online",
    health: "good",
    lastHeartbeat: "38 sec ago",
    lastSync: "2 min ago",
    source: "D:\\Xcalibur\\Data",
    target: "\\\\TBN-SERVER\\BoxMirror\\Orbitrap",
    filesToday: 28,
    storage: "256 GB",
    queue: 0,
    watch: true,
    activity: 78,
    icon: "orbitrap",
  },
  {
    name: "SMPS",
    type: "Aerosol Sizing",
    computer: "SMPS-LAB-PC",
    status: "online",
    health: "good",
    lastHeartbeat: "1 min ago",
    lastSync: "18 min ago",
    source: "C:\\TSI\\AIM\\Data",
    target: "\\\\TBN-SERVER\\BoxMirror\\SMPS",
    filesToday: 16,
    storage: "112 GB",
    queue: 1,
    watch: true,
    activity: 62,
    icon: "smps",
  },
  {
    name: "Chamber",
    type: "10 m³ Chamber",
    computer: "CHAMBER-DAQ",
    status: "online",
    health: "warning",
    lastHeartbeat: "2 min ago",
    lastSync: "5 min ago",
    source: "C:\\ChamberDAQ\\Runs",
    target: "\\\\TBN-SERVER\\BoxMirror\\Chamber",
    filesToday: 42,
    storage: "340 GB",
    queue: 3,
    watch: true,
    activity: 85,
    icon: "chamber",
  },
  {
    name: "GC-MS",
    type: "ChemStation / MassHunter",
    computer: "GCMS-01",
    status: "online",
    health: "good",
    lastHeartbeat: "52 sec ago",
    lastSync: "12 min ago",
    source: "D:\\Chem32\\1\\Data",
    target: "\\\\TBN-SERVER\\BoxMirror\\GC-MS",
    filesToday: 33,
    storage: "512 GB",
    queue: 0,
    watch: true,
    activity: 71,
    icon: "gcms",
  },
  {
    name: "GC-FID",
    type: "ChemStation",
    computer: "GCFID-02",
    status: "online",
    health: "good",
    lastHeartbeat: "1 min ago",
    lastSync: "9 min ago",
    source: "D:\\Chem32\\2\\Data",
    target: "\\\\TBN-SERVER\\BoxMirror\\GC-FID",
    filesToday: 27,
    storage: "210 GB",
    queue: 0,
    watch: true,
    activity: 68,
    icon: "gcfid",
  },
  {
    name: "UV-Vis",
    type: "Spectra CSV / TXT",
    computer: "UVVIS-PC",
    status: "offline",
    health: "critical",
    lastHeartbeat: "2 hr ago",
    lastSync: "2 hrs ago",
    source: "C:\\UVProbe\\Data",
    target: "\\\\TBN-SERVER\\BoxMirror\\UV-Vis",
    filesToday: 0,
    storage: "48 GB",
    queue: 0,
    watch: false,
    activity: 0,
    icon: "uvvis",
  },
  {
    name: "INFICON-GC-MS",
    type: "Portable GC-MS",
    computer: "INFICON-LAPTOP",
    status: "online",
    health: "warning",
    lastHeartbeat: "3 min ago",
    lastSync: "7 min ago",
    source: "C:\\Inficon\\Methods\\Data",
    target: "\\\\TBN-SERVER\\BoxMirror\\INFICON-GC-MS",
    filesToday: 19,
    storage: "180 GB",
    queue: 2,
    watch: false,
    activity: 66,
    icon: "inficon",
  },
];

const jobs = [
  {
    name: "Orbitrap nightly mirror",
    source: "Orbitrap",
    mode: "One-way",
    conflict: "Timestamp suffix",
    schedule: "Daily 8:00 PM",
    status: "Enabled",
  },
  {
    name: "GC-MS watch sync",
    source: "GC-MS",
    mode: "One-way",
    conflict: "Version number",
    schedule: "Watch + 30 sec",
    status: "Enabled",
  },
  {
    name: "Chamber campaign backup",
    source: "Chamber",
    mode: "One-way",
    conflict: "Skip",
    schedule: "Hourly",
    status: "Enabled",
  },
  {
    name: "UV-Vis CSV collection",
    source: "UV-Vis",
    mode: "One-way",
    conflict: "Version number",
    schedule: "Manual",
    status: "Paused",
  },
];

const logs = [
  {
    time: "2 min ago",
    job: "Orbitrap sync completed",
    computer: "ORBITRAP-PC",
    status: "success",
    copied: 9,
    skipped: 1,
    failed: 0,
    trigger: "watch",
  },
  {
    time: "18 min ago",
    job: "SMPS data synchronized",
    computer: "SMPS-LAB-PC",
    status: "success",
    copied: 16,
    skipped: 0,
    failed: 0,
    trigger: "schedule",
  },
  {
    time: "12 min ago",
    job: "GC-MS run completed",
    computer: "GCMS-01",
    status: "running",
    copied: 18,
    skipped: 0,
    failed: 0,
    trigger: "manual",
  },
  {
    time: "25 min ago",
    job: "Chamber data archived",
    computer: "CHAMBER-DAQ",
    status: "warning",
    copied: 2,
    skipped: 0,
    failed: 1,
    trigger: "schedule",
  },
];

const syncQueue = [
  { name: "INFICON-GC-MS", detail: "Uploading 19 files", percent: 65 },
  { name: "GC-FID", detail: "Processing 12 files", percent: 40 },
  { name: "SMPS", detail: "Uploading 8 files", percent: 25 },
];

const iconTypes = ["orbitrap", "smps", "chamber", "gcms", "gcfid", "uvvis", "inficon"];

function runDataTests() {
  const results = [];

  function assert(name, condition, details) {
    results.push({
      name,
      pass: Boolean(condition),
      details: condition ? "PASS" : details || "FAIL",
    });
  }

  const instrumentNames = instruments.map((item) => item.name);
  const jobNames = jobs.map((job) => job.name);

  assert(
    "Instrument names are unique",
    new Set(instrumentNames).size === instrumentNames.length,
    "Duplicate instrument names found"
  );

  assert(
    "Job names are unique",
    new Set(jobNames).size === jobNames.length,
    "Duplicate job names found"
  );

  assert(
    "At least one instrument is present",
    instruments.length > 0,
    "No instruments configured"
  );

  assert("At least one job is present", jobs.length > 0, "No jobs configured");

  assert(
    "Every job source maps to a real instrument",
    jobs.every((job) => instrumentNames.includes(job.source)),
    "One or more job sources do not match an instrument"
  );

  assert(
    "Every instrument has required fields",
    instruments.every(
      (item) =>
        item.name &&
        item.type &&
        item.computer &&
        item.status &&
        item.health &&
        item.source &&
        item.target &&
        item.icon
    ),
    "One or more instruments are missing required fields"
  );

  assert(
    "Every instrument has a valid status",
    instruments.every((item) => ["online", "offline"].includes(item.status)),
    "One or more instruments have an invalid status"
  );

  assert(
    "Every instrument has a valid health value",
    instruments.every((item) => ["good", "warning", "critical"].includes(item.health)),
    "One or more instruments have an invalid health value"
  );

  assert(
    "Every instrument has a valid icon",
    instruments.every((item) => iconTypes.includes(item.icon)),
    "One or more instrument cards reference a missing icon"
  );

  assert(
    "Every instrument has a valid activity percent",
    instruments.every((item) => Number.isFinite(item.activity) && item.activity >= 0 && item.activity <= 100),
    "One or more activity values are outside 0-100"
  );

  assert(
    "Every log has a supported status",
    logs.every((log) => ["success", "running", "warning", "failed"].includes(log.status)),
    "One or more logs have invalid statuses"
  );

  assert(
    "File counters are non-negative",
    [
      ...instruments.map((item) => item.filesToday),
      ...logs.flatMap((log) => [log.copied, log.skipped, log.failed]),
    ].every((value) => Number.isFinite(value) && value >= 0),
    "One or more file counters are invalid"
  );

  assert(
    "Sync queue percentages are valid",
    syncQueue.every((item) => Number.isFinite(item.percent) && item.percent >= 0 && item.percent <= 100),
    "One or more sync queue percentages are outside 0-100"
  );

  return results;
}

const TEST_RESULTS = runDataTests();

const theme = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 18% 4%, rgba(34,211,238,0.15), transparent 28%), radial-gradient(circle at 82% 0%, rgba(56,189,248,0.10), transparent 30%), linear-gradient(135deg, #06111b 0%, #08131f 42%, #020811 100%)",
    color: "#e5eef7",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxSizing: "border-box",
    padding: 0,
  },
  appShell: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "260px minmax(0, 1fr) 340px",
    gap: 16,
    padding: 16,
    boxSizing: "border-box",
  },
  glass: {
    background: "linear-gradient(180deg, rgba(12,29,45,0.86), rgba(5,17,29,0.78))",
    border: "1px solid rgba(103,232,249,0.16)",
    boxShadow: "0 22px 70px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
    backdropFilter: "blur(14px)",
  },
  sidebar: {
    borderRadius: 22,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "6px 6px 14px 6px",
  },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    background: "rgba(34,211,238,0.12)",
    border: "1px solid rgba(103,232,249,0.25)",
    display: "grid",
    placeItems: "center",
    color: "#67e8f9",
    fontWeight: 950,
  },
  nav: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: "13px 14px",
    color: "#b9c8d6",
    fontWeight: 700,
  },
  navItemActive: {
    background: "linear-gradient(90deg, rgba(34,211,238,0.18), rgba(34,211,238,0.04))",
    color: "#7df9ff",
    border: "1px solid rgba(103,232,249,0.28)",
  },
  labEnv: {
    marginTop: "auto",
    borderRadius: 16,
    background: "rgba(0,0,0,0.22)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: 14,
    display: "flex",
    gap: 12,
    alignItems: "center",
  },
  center: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  topBar: {
    minHeight: 76,
    borderRadius: 22,
    padding: "12px 16px",
    display: "grid",
    gridTemplateColumns: "minmax(280px, 1fr) auto",
    gap: 14,
    alignItems: "center",
  },
  search: {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.24)",
    color: "#91a6b8",
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    maxWidth: 720,
  },
  topActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  primaryButton: {
    background: "rgba(34,211,238,0.10)",
    color: "#7df9ff",
    border: "1px solid rgba(103,232,249,0.28)",
    borderRadius: 15,
    padding: "12px 16px",
    fontWeight: 900,
    cursor: "pointer",
  },
  iconButton: {
    width: 46,
    height: 46,
    display: "grid",
    placeItems: "center",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#dce7f2",
    fontWeight: 900,
  },
  mainPanel: {
    borderRadius: 24,
    padding: 24,
    minHeight: "calc(100vh - 124px)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 20,
    flexWrap: "wrap",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  pill: {
    borderRadius: 13,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.18)",
    color: "#d8e8f4",
    padding: "10px 13px",
    fontSize: 13,
    fontWeight: 800,
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 16,
  },
  card: {
    borderRadius: 20,
    padding: 14,
    border: "1px solid rgba(103,232,249,0.18)",
    background:
      "radial-gradient(circle at 50% 0%, rgba(103,232,249,0.15), transparent 45%), linear-gradient(180deg, rgba(15,38,56,0.85), rgba(4,17,29,0.88))",
    boxShadow: "0 16px 46px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.05)",
    color: "inherit",
    cursor: "pointer",
    textAlign: "left",
    minHeight: 292,
    display: "flex",
    flexDirection: "column",
  },
  cardSelected: {
    border: "1px solid rgba(125,249,255,0.62)",
    boxShadow: "0 0 0 1px rgba(125,249,255,0.10), 0 18px 60px rgba(34,211,238,0.12)",
  },
  iconStage: {
    height: 132,
    borderRadius: 16,
    background: "radial-gradient(circle at 50% 40%, rgba(125,249,255,0.18), rgba(255,255,255,0.02) 52%, transparent 72%)",
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
  },
  cardTitleRow: {
    marginTop: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statRow: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    borderTop: "1px solid rgba(255,255,255,0.07)",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  statCell: {
    padding: "10px 6px",
    borderRight: "1px solid rgba(255,255,255,0.07)",
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    background: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    marginTop: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #2dd4bf, #67e8f9)",
  },
  rightRail: {
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  railPanel: {
    borderRadius: 20,
    padding: 16,
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },
  listItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  footerPanel: {
    gridColumn: "1 / -1",
    borderRadius: 20,
    padding: 16,
    display: "none",
  },
};

function Button({ children, primary = false, onClick }) {
  return (
    <button type="button" onClick={onClick} style={primary ? theme.primaryButton : theme.iconButton}>
      {children}
    </button>
  );
}

function getStatusStyle(status) {
  if (status === "online") {
    return {
      background: "rgba(34,197,94,0.16)",
      color: "#86efac",
      border: "1px solid rgba(34,197,94,0.32)",
    };
  }
  return {
    background: "rgba(245,158,11,0.16)",
    color: "#fcd34d",
    border: "1px solid rgba(245,158,11,0.32)",
  };
}

function getLogStyle(status) {
  if (status === "success") return { background: "#4ade80", color: "#062012" };
  if (status === "running") return { background: "#67e8f9", color: "#052432" };
  if (status === "warning") return { background: "#facc15", color: "#2d2205" };
  return { background: "#fb7185", color: "#2d0710" };
}

function Sparkline({ muted = false }) {
  const stroke = muted ? "rgba(148,163,184,0.46)" : "#67e8f9";
  return (
    <svg width="64" height="24" viewBox="0 0 64 24" aria-hidden="true">
      <path
        d="M1 16 C6 16, 7 10, 11 12 S17 20, 22 14 S29 10, 33 13 S39 19, 44 11 S48 3, 53 5 S58 21, 63 15"
        fill="none"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusBadge({ status }) {
  return (
    <span
      style={{
        ...getStatusStyle(status),
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 900,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        textTransform: "capitalize",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: "currentColor" }} />
      {status}
    </span>
  );
}

const ICON_SOURCES = {
  orbitrap: "./assets/Orbitrap.png",
  smps: "./assets/SMPS.png",
  chamber: "./assets/Chamber.png",
  gcms: "./assets/GCMS.png",
  gcfid: "./assets/GCFID.png",
  uvvis: "./assets/UVVIS.png",
  inficon: "./assets/PGCMS.png",
};

function InstrumentIcon({ type }) {
  const src = ICON_SOURCES[type] ?? ICON_SOURCES.inficon;
  return (
    <img
      src={src}
      alt=""
      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
    />
  );
}

function InstrumentCard({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{ ...theme.card, ...(selected ? theme.cardSelected : {}) }}
      aria-label={`Open ${item.name}`}
    >
      <div style={theme.iconStage}>
        <InstrumentIcon type={item.icon} />
      </div>
      <div style={theme.cardTitleRow}>
        <div>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 22, lineHeight: 1.05, fontWeight: 950 }}>{item.name}</h3>
          <div style={{ marginTop: 4, color: "#91a6b8", fontSize: 12, fontWeight: 700 }}>{item.type}</div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div style={theme.statRow}>
        <div style={theme.statCell}>
          <div style={{ color: "#91a6b8", fontSize: 11 }}>Last Run</div>
          <div style={{ marginTop: 4, color: "#fff", fontSize: 13 }}>{item.lastSync}</div>
        </div>
        <div style={theme.statCell}>
          <div style={{ color: "#91a6b8", fontSize: 11 }}>Files Today</div>
          <div style={{ marginTop: 4, color: "#fff", fontSize: 13 }}>{item.filesToday}</div>
        </div>
        <div style={{ ...theme.statCell, borderRight: "none" }}>
          <div style={{ color: "#91a6b8", fontSize: 11 }}>Storage</div>
          <div style={{ marginTop: 4, color: "#67e8f9", fontSize: 13, fontWeight: 900 }}>{item.storage}</div>
        </div>
      </div>

      <div style={{ marginTop: "auto", paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "#c9d6e2", fontSize: 12 }}>Activity</span>
          <span style={{ color: item.activity > 0 ? "#c9d6e2" : "#6b7f90", fontSize: 12 }}>{item.activity}%</span>
          <Sparkline muted={item.activity === 0} />
        </div>
        <div style={theme.progressTrack}>
          <div style={{ ...theme.progressFill, width: `${item.activity}%`, opacity: item.activity === 0 ? 0.25 : 1 }} />
        </div>
      </div>
    </button>
  );
}

function RailPanel({ title, icon, children }) {
  return (
    <section style={{ ...theme.glass, ...theme.railPanel }}>
      <h2 style={{ margin: "0 0 14px 0", color: "#fff", fontSize: 17, display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ color: "#67e8f9" }}>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function NavItem({ icon, label, active, badge }) {
  return (
    <div style={{ ...theme.navItem, ...(active ? theme.navItemActive : {}) }}>
      <span style={{ width: 22, color: active ? "#67e8f9" : "#c9d6e2" }}>{icon}</span>
      <span>{label}</span>
      {badge ? (
        <span
          style={{
            marginLeft: "auto",
            width: 22,
            height: 22,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: "#67e8f9",
            color: "#052432",
            fontSize: 12,
            fontWeight: 950,
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function DataBasedLogo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <g fill="none" stroke="#67e8f9" strokeWidth="2">
        <path d="M17 5 L27 11 L27 23 L17 29 L7 23 L7 11 Z" opacity="0.85" />
        <path d="M17 5 L17 29 M7 11 L27 23 M27 11 L7 23" opacity="0.35" />
      </g>
      {[17, 27, 27, 17, 7, 7].map((cx, i) => {
        const cy = [5, 11, 23, 29, 23, 11][i];
        return <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.3" fill="#67e8f9" />;
      })}
    </svg>
  );
}

export default function DataBasedInstrumentSyncDashboard() {
  const [selected, setSelected] = useState(instruments[0]);
  const [showTests, setShowTests] = useState(false);

  const stats = useMemo(() => {
    const online = instruments.filter((item) => item.status === "online").length;
    const copied = instruments.reduce((sum, item) => sum + item.filesToday, 0);
    const queued = instruments.reduce((sum, item) => sum + item.queue, 0);
    const storageText = "1.66 TB / 5 TB";
    return { online, copied, queued, storageText };
  }, []);

  const failedTests = TEST_RESULTS.filter((test) => !test.pass);

  return (
    <div style={theme.page}>
      <div style={theme.appShell}>
        <aside style={{ ...theme.glass, ...theme.sidebar }}>
          <div style={theme.brand}>
            <div style={theme.logoMark}>
              <DataBasedLogo />
            </div>
            <div>
              <div style={{ color: "#fff", fontSize: 24, fontWeight: 950, lineHeight: 1 }}>DataBased</div>
              <div style={{ color: "#67e8f9", fontSize: 12, fontWeight: 900, marginTop: 5, letterSpacing: "0.03em" }}>
                INSTRUMENT DASHBOARD
              </div>
            </div>
          </div>

          <nav style={theme.nav}>
            <NavItem icon="⌂" label="Dashboard" />
            <NavItem icon="⚗" label="Instruments" active />
            <NavItem icon="↻" label="Sync Jobs" />
            <NavItem icon="▤" label="Logs" />
            <NavItem icon="♢" label="Alerts" badge="3" />
            <NavItem icon="⚙" label="Settings" />
          </nav>

          <div style={theme.labEnv}>
            <div style={{ width: 58, height: 58, borderRadius: 12, border: "1px solid rgba(103,232,249,0.24)", display: "grid", placeItems: "center", color: "#67e8f9" }}>
              <Sparkline />
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 900 }}>Lab Environment</div>
              <div style={{ color: "#67e8f9", marginTop: 6 }}>Production</div>
              <div style={{ color: "#9fb1c2", fontSize: 12, marginTop: 6 }}>Server: db-lab-01</div>
              <div style={{ color: "#9fb1c2", fontSize: 12 }}>Version: v2.4.1</div>
            </div>
          </div>
        </aside>

        <main style={theme.center}>
          <header style={{ ...theme.glass, ...theme.topBar }}>
            <div style={theme.search}>
              <span>⌕ &nbsp; Search instruments, jobs, files...</span>
              <span style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "3px 8px", color: "#cbd7e3" }}>⌘ K</span>
            </div>
            <div style={theme.topActions}>
              <Button primary>＋ Add Instrument</Button>
              <Button>⇩</Button>
              <Button>🔔</Button>
              <Button>◎</Button>
            </div>
          </header>

          <section style={{ ...theme.glass, ...theme.mainPanel }}>
            <div style={theme.sectionHeader}>
              <div>
                <h1 style={{ margin: 0, fontSize: 31, lineHeight: 1.1, color: "#fff", fontWeight: 950 }}>Instruments</h1>
                <div style={{ color: "#67e8f9", marginTop: 6, fontWeight: 800 }}>{instruments.length} instruments</div>
              </div>
              <div style={theme.toolbar}>
                <button type="button" style={{ ...theme.pill, color: "#67e8f9" }}>▦</button>
                <button type="button" style={theme.pill}>☷</button>
                <button type="button" style={theme.pill}>All Groups⌄</button>
                <button type="button" style={theme.pill}>Sort: Status⌄</button>
                <button type="button" style={theme.pill} onClick={() => setShowTests((value) => !value)}>
                  Tests: {failedTests.length === 0 ? "Pass" : "Fail"}
                </button>
              </div>
            </div>

            <div style={theme.cardsGrid}>
              {instruments.map((item) => (
                <InstrumentCard
                  key={item.name}
                  item={item}
                  selected={selected.name === item.name}
                  onSelect={() => setSelected(item)}
                />
              ))}
            </div>

            {showTests ? (
              <section style={{ marginTop: 18, borderRadius: 18, border: "1px solid rgba(255,255,255,0.08)", padding: 14, background: "rgba(0,0,0,0.16)" }}>
                <h3 style={{ margin: 0, color: "#fff" }}>Runtime data tests</h3>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                  {TEST_RESULTS.map((test) => (
                    <div
                      key={test.name}
                      style={{
                        borderRadius: 14,
                        padding: 12,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: test.pass ? "rgba(16,185,129,0.10)" : "rgba(244,63,94,0.10)",
                      }}
                    >
                      <div style={{ fontWeight: 900, color: "#fff" }}>{test.name}</div>
                      <div style={{ marginTop: 6, color: test.pass ? "#86efac" : "#fda4af", fontSize: 13 }}>{test.details}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        </main>

        <aside style={theme.rightRail}>
          <RailPanel title="System Status" icon="⌁">
            <div style={{ borderRadius: 14, background: "rgba(0,0,0,0.20)", border: "1px solid rgba(255,255,255,0.08)", padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", fontWeight: 900 }}>
                <span>All Systems</span>
                <span style={{ color: "#86efac" }}>◎ Healthy</span>
              </div>
              <div style={{ ...theme.list, marginTop: 12 }}>
                <div style={theme.listItem}><span>• Instruments</span><span style={{ color: "#67e8f9" }}>{stats.online} Online</span></div>
                <div style={theme.listItem}><span>• Storage</span><span>{stats.storageText}</span></div>
                <div style={theme.listItem}><span>• Sync Jobs</span><span style={{ color: "#67e8f9" }}>{stats.queued} Running</span></div>
                <div style={{ ...theme.listItem, borderBottom: "none" }}><span>• Database</span><span style={{ color: "#86efac" }}>Healthy</span></div>
              </div>
            </div>
          </RailPanel>

          <RailPanel title="Selected Instrument" icon="◉">
            <div style={{ display: "grid", placeItems: "center", height: 126, borderRadius: 16, background: "rgba(0,0,0,0.18)", marginBottom: 12 }}>
              <InstrumentIcon type={selected.icon} />
            </div>
            <h3 style={{ margin: 0, color: "#fff", fontSize: 22 }}>{selected.name}</h3>
            <div style={{ color: "#91a6b8", marginTop: 4 }}>{selected.computer} · {selected.type}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
              <div style={{ ...theme.pill, padding: 10 }}>
                <div style={{ color: "#91a6b8", fontSize: 11 }}>Source</div>
                <div style={{ marginTop: 4, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.source}</div>
              </div>
              <div style={{ ...theme.pill, padding: 10 }}>
                <div style={{ color: "#91a6b8", fontSize: 11 }}>Target</div>
                <div style={{ marginTop: 4, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.target}</div>
              </div>
            </div>
          </RailPanel>

          <RailPanel title="Recent Activity" icon="↺">
            <div style={theme.list}>
              {logs.map((log) => (
                <div key={`${log.time}-${log.job}`} style={theme.listItem}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ ...getLogStyle(log.status), width: 20, height: 20, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 950 }}>✓</span>
                    <span style={{ color: "#e5eef7", fontSize: 13 }}>{log.job}</span>
                  </div>
                  <span style={{ color: "#91a6b8", fontSize: 12 }}>{log.time}</span>
                </div>
              ))}
            </div>
          </RailPanel>

          <RailPanel title="Sync Queue" icon="↻">
            <div style={theme.list}>
              {syncQueue.map((item) => (
                <div key={item.name} style={{ paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 900 }}>{item.name}</div>
                      <div style={{ color: "#91a6b8", fontSize: 12, marginTop: 3 }}>{item.detail}</div>
                    </div>
                    <div style={{ color: "#c9d6e2", fontSize: 12 }}>{item.percent}%</div>
                  </div>
                  <div style={theme.progressTrack}>
                    <div style={{ ...theme.progressFill, width: `${item.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </RailPanel>
        </aside>
      </div>
    </div>
  );
}
