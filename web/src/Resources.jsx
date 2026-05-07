import { useEffect, useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { Spark } from "./icons";
import { uptime } from "./format";

function MiniBar({ pct, color = D.cyan, height = 6 }) {
  return (
    <div style={{ height, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: color, transition: "width .3s ease" }} />
    </div>
  );
}

function severityFor(pct) {
  if (pct >= 90) return D.bad;
  if (pct >= 70) return D.warn;
  return D.cyan;
}

// Tighter thresholds for memory because non-paged pool exhaustion (the
// classic Win 7 "0x800705AA" failure) hits well before the OS reports 90%
// total used. 80% means "stop and look" rather than "things are already
// breaking."
function severityForMemory(pct) {
  if (pct >= 95) return D.bad;
  if (pct >= 80) return D.warn;
  return D.cyan;
}

function formatIdle(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function CoreGrid({ cores }) {
  if (!cores || !cores.length) return null;
  // 4 cols, more rows as needed
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: 8 }}>
      {cores.map((c, i) => (
        <div key={i} title={`Core ${i}: ${c}%`} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontFamily: "Geist Mono", color: D.faint }}>
          <span style={{ width: 14 }}>{i}</span>
          <div style={{ flex: 1 }}>
            <MiniBar pct={c} color={severityFor(c)} height={5} />
          </div>
          <span style={{ width: 26, textAlign: "right", color: D.ink }}>{Math.round(c)}</span>
        </div>
      ))}
    </div>
  );
}

function StatRow({ label, value, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <span style={{ fontSize: 11, color: D.sub }}>{label}</span>
      <span>
        <span style={{ fontFamily: "Geist Mono", fontSize: 12, color: "#fff" }}>{value}</span>
        {sub ? <span style={{ fontFamily: "Geist Mono", fontSize: 10, color: D.faint, marginLeft: 6 }}>{sub}</span> : null}
      </span>
    </div>
  );
}

export default function Resources({ computerId, host = false, mountFilter = null }) {
  const [data, setData] = useState({ latest: null, history: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!host && !computerId) return;
    let alive = true;
    async function tick() {
      try {
        const d = host ? await api.hostMetrics() : await api.metrics(computerId);
        if (alive) {
          setData(d);
          setError("");
        }
      } catch (err) {
        if (alive) setError(err.message);
      }
    }
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [computerId, host]);

  const m = data.latest;
  const cpuHist = data.history.map((s) => s?.cpu?.overall ?? 0);
  const ramHist = data.history.map((s) => s?.memory?.percent ?? 0);

  if (!m) {
    return (
      <div style={{ fontSize: 11, color: D.faint, padding: 8 }}>
        {error ? `Error: ${error}` : "Waiting for metrics… (agent v0.4+ required)"}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* CPU */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700 }}>
            CPU · {m.cpu.cores} cores{m.cpu.freq_mhz ? ` · ${(m.cpu.freq_mhz / 1000).toFixed(2)} GHz` : ""}
          </span>
          <span style={{ fontFamily: "Geist Mono", fontSize: 14, color: severityFor(m.cpu.overall), fontWeight: 700 }}>{Math.round(m.cpu.overall)}%</span>
        </div>
        <div style={{ padding: "0 4px" }}>
          <Spark values={cpuHist} w={290} h={28} stroke={severityFor(m.cpu.overall)} responsive />
        </div>
        <CoreGrid cores={m.cpu.per_core} />
      </div>

      {/* Memory */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700 }}>Memory</span>
          <span style={{ fontFamily: "Geist Mono", fontSize: 12, color: "#fff" }}>
            {m.memory.used_gb} / {m.memory.total_gb} GB
            <span style={{ color: severityForMemory(m.memory.percent), marginLeft: 8 }}>({Math.round(m.memory.percent)}%)</span>
          </span>
        </div>
        <div style={{ padding: "0 4px" }}>
          <Spark values={ramHist} w={290} h={20} stroke={severityForMemory(m.memory.percent)} responsive />
        </div>
        <div style={{ marginTop: 4 }}><MiniBar pct={m.memory.percent} color={severityForMemory(m.memory.percent)} height={4} /></div>
      </div>

      {/* Disks */}
      {(() => {
        const allow = Array.isArray(mountFilter) && mountFilter.length
          ? new Set(mountFilter.map((s) => String(s).toLowerCase()))
          : null;
        const filtered = (m.disks || []).filter((d) => !allow || allow.has(String(d.mount).toLowerCase()));
        if (!filtered.length) return null;
        return (
        <div>
          <div style={{ fontSize: 10, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            {allow ? "Monitored drives" : "Disks"}
            {m.disk_io ? (
              <span style={{ marginLeft: 8, fontFamily: "Geist Mono", color: D.cyan, textTransform: "none", letterSpacing: 0 }}>
                ↓{m.disk_io.read_mbps.toFixed(1)} ↑{m.disk_io.write_mbps.toFixed(1)} MB/s
              </span>
            ) : null}
          </div>
          {filtered.slice(0, allow ? filtered.length : 4).map((d) => (
            <div key={d.mount} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "Geist Mono", fontSize: 11, color: D.ink }}>{d.mount}</span>
                <span style={{ fontFamily: "Geist Mono", fontSize: 10, color: D.sub }}>
                  {d.used_gb} / {d.total_gb} GB <span style={{ color: severityFor(d.percent), marginLeft: 4 }}>({Math.round(d.percent)}%)</span>
                </span>
              </div>
              <div style={{ marginTop: 3 }}><MiniBar pct={d.percent} color={severityFor(d.percent)} height={3} /></div>
            </div>
          ))}
        </div>
        );
      })()}

      {/* Network */}
      <div>
        <div style={{ fontSize: 10, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span>Network</span>
          {m.primary_link ? (
            <span style={{ fontFamily: "Geist Mono", color: m.primary_link.type === "wifi" ? D.warn : D.cyan, textTransform: "none", letterSpacing: 0, fontSize: 10 }}>
              {m.primary_link.type === "wifi" ? "📶" : m.primary_link.type === "ethernet" ? "🔌" : "·"} {m.primary_link.name}
              {m.primary_link.speed_mbps ? ` · ${m.primary_link.speed_mbps} Mbps` : ""}
            </span>
          ) : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontFamily: "Geist Mono", fontSize: 12 }}>
          <div>
            <div style={{ color: D.faint, fontSize: 9 }}>↓ DOWN</div>
            <div style={{ color: "#fff" }}>{m.network.recv_kbps.toFixed(0)}<span style={{ color: D.sub, fontSize: 10 }}> Kbps</span></div>
          </div>
          <div>
            <div style={{ color: D.faint, fontSize: 9 }}>↑ UP</div>
            <div style={{ color: "#fff" }}>{m.network.sent_kbps.toFixed(0)}<span style={{ color: D.sub, fontSize: 10 }}> Kbps</span></div>
          </div>
        </div>
      </div>

      {/* Watched processes (acquisition software, etc.) */}
      {m.watched_processes && m.watched_processes.length ? (
        <div>
          <div style={{ fontSize: 10, color: D.faint, letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>Software</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {m.watched_processes.map((p) => (
              <span
                key={p.name}
                title={p.running ? `Running (PID ${p.pid})` : "Not running"}
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "Geist Mono",
                  background: p.running ? "rgba(74,222,128,.16)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${p.running ? "rgba(74,222,128,.36)" : "rgba(255,255,255,.10)"}`,
                  color: p.running ? D.ok : D.faint,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: 999, background: p.running ? D.ok : D.faint }} />
                {p.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Counts + uptime + activity */}
      <div>
        {m.idle_seconds != null ? (
          <StatRow
            label="User input"
            value={m.idle_seconds < 5 ? "active now" : `${formatIdle(m.idle_seconds)} idle`}
          />
        ) : null}
        {m.last_file_event_seconds != null ? (
          <StatRow
            label="Last file event"
            value={m.last_file_event_seconds < 5 ? "just now" : `${formatIdle(m.last_file_event_seconds)} ago`}
          />
        ) : null}
        <StatRow label="Processes" value={m.processes} />
        {m.threads != null ? <StatRow label="Threads" value={m.threads.toLocaleString()} /> : null}
        {m.handles != null ? <StatRow label="Handles" value={m.handles.toLocaleString()} /> : null}
        <StatRow label="Uptime" value={uptime(m.uptime_seconds)} />
      </div>
    </div>
  );
}
