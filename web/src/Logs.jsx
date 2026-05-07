import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { D, logStatusColor } from "./theme";
import { UI } from "./icons";
import { clockTime, duration } from "./format";

const FILTERS = ["All", "Success", "Warning", "Failed", "Running"];

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(rows, jobName, computerName) {
  const header = ["time", "job", "computer", "trigger", "status", "copied", "skipped", "failed", "duration", "error"];
  const lines = [header.join(",")];
  for (const l of rows) {
    lines.push([
      l.started_at ?? "",
      jobName(l.job_id) ?? "",
      computerName(l.computer_id) ?? "",
      l.triggered_by ?? "",
      l.status ?? "",
      l.files_copied,
      l.files_skipped,
      l.files_failed,
      duration(l.started_at, l.completed_at),
      l.error_message ?? "",
    ].map(csvEscape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `databased-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function FileLine({ line }) {
  // Format: "+ path", "~ path", "x path"  (copied / skipped / failed)
  const sym = line[0];
  const path = line.slice(2);
  const color = sym === "+" ? D.ok : sym === "x" ? D.bad : D.faint;
  const glyph = sym === "+" ? "↑" : sym === "x" ? "✕" : "↷";
  return (
    <div style={{ display: "flex", gap: 8, padding: "2px 0", fontFamily: "Geist Mono", fontSize: 11 }}>
      <span style={{ width: 12, color, textAlign: "center" }}>{glyph}</span>
      <span style={{ color: D.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
    </div>
  );
}

function ExpandedDetails({ log }) {
  const lines = (log.file_list ?? "").split("\n").filter(Boolean);
  return (
    <div style={{ padding: "10px 18px 14px 110px", background: "rgba(0,0,0,.18)", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
      {log.error_message ? (
        <div style={{ marginBottom: 10, padding: "8px 10px", borderRadius: 6, background: "rgba(244,63,94,.08)", border: "1px solid rgba(244,63,94,.18)", color: D.bad, fontFamily: "Geist Mono", fontSize: 11 }}>
          {log.error_message}
        </div>
      ) : null}
      {lines.length === 0 ? (
        <div style={{ color: D.faint, fontSize: 11, fontFamily: "Geist Mono" }}>No file list captured for this run.</div>
      ) : (
        <>
          <div style={{ fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
            Files ({lines.length}) · ↑ copied · ↷ skipped · ✕ failed
          </div>
          <div style={{ maxHeight: 280, overflow: "auto", paddingRight: 6 }}>
            {lines.map((l, i) => <FileLine key={i} line={l} />)}
          </div>
        </>
      )}
    </div>
  );
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [computers, setComputers] = useState([]);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [l, j, c] = await Promise.all([api.logs({ limit: 500 }), api.jobs(), api.computers()]);
      setLogs(l);
      setJobs(j);
      setComputers(c);
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

  const jobName = useMemo(() => {
    const m = {};
    for (const j of jobs) m[j.id] = j.name;
    return (id) => m[id];
  }, [jobs]);
  const computerName = useMemo(() => {
    const m = {};
    for (const c of computers) m[c.id] = c.name;
    return (id) => m[id];
  }, [computers]);

  const filtered = useMemo(() => {
    let out = logs;
    if (filter !== "All") {
      const want = filter.toLowerCase();
      out = out.filter((l) => l.status === want);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((l) => {
        const job = (jobName(l.job_id) ?? "").toLowerCase();
        const comp = (computerName(l.computer_id) ?? "").toLowerCase();
        const err = (l.error_message ?? "").toLowerCase();
        const trig = (l.triggered_by ?? "").toLowerCase();
        return job.includes(q) || comp.includes(q) || err.includes(q) || trig.includes(q);
      });
    }
    return out;
  }, [logs, filter, search, jobName, computerName]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, minHeight: 0 }}>
      <div>
        <div style={{ fontSize: 10, color: D.cyan, fontWeight: 700, letterSpacing: ".12em" }}>SYNC MANAGER / LOGS</div>
        <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-.02em" }}>Activity Logs</h1>
        <div style={{ fontSize: 12, color: D.sub, marginTop: 3 }}>
          {filtered.length} of {logs.length} runs shown
          {search ? ` · matching "${search}"` : ""}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderRadius: 10, background: "rgba(0,0,0,.24)", border: "1px solid rgba(255,255,255,.08)" }}>
          <UI name="search" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by job, instrument, error, trigger…"
            style={{ flex: 1, padding: "9px 0", background: "transparent", border: "none", outline: "none", color: D.ink, fontSize: 12, fontFamily: "Geist" }}
          />
          {search ? (
            <button
              onClick={() => setSearch("")}
              style={{ width: 20, height: 20, borderRadius: 5, border: "none", background: "transparent", color: D.faint, cursor: "pointer", display: "grid", placeItems: "center" }}
            >
              <UI name="x" size={11} />
            </button>
          ) : null}
        </div>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,.10)",
              background: f === filter ? "rgba(34,211,238,.12)" : "rgba(0,0,0,.18)",
              color: f === filter ? D.cyan : D.sub,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
        <button
          onClick={() => downloadCsv(filtered, jobName, computerName)}
          disabled={!filtered.length}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "rgba(0,0,0,.18)", color: D.ink, fontSize: 11, cursor: filtered.length ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: 6, opacity: filtered.length ? 1 : 0.5 }}
        >
          <UI name="download" size={12} /> Export ({filtered.length})
        </button>
      </div>

      {error ? (
        <div style={{ color: D.bad, padding: 12, borderRadius: 10, background: "rgba(244,63,94,.10)", fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ flex: 1, background: D.glass, border: D.glassBorder, borderRadius: 16, overflow: "auto", fontFamily: "Geist Mono", fontSize: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: D.sub, fontFamily: "Geist", fontSize: 13 }}>No logs match.</div>
        ) : (
          filtered.map((l) => {
            const c = logStatusColor(l.status);
            const isExpanded = expanded === l.id;
            const hasDetail = (l.file_list && l.file_list.trim()) || l.error_message;
            return (
              <div key={l.id}>
                <div
                  onClick={() => hasDetail && setExpanded(isExpanded ? null : l.id)}
                  style={{
                    padding: "12px 18px",
                    borderBottom: isExpanded ? "none" : "1px solid rgba(255,255,255,.05)",
                    display: "grid",
                    gridTemplateColumns: "78px 14px 1fr 130px 90px 130px 80px",
                    gap: 10,
                    alignItems: "center",
                    cursor: hasDetail ? "pointer" : "default",
                    background: isExpanded ? "rgba(34,211,238,.04)" : "transparent",
                  }}
                >
                  <span style={{ color: D.faint }}>{clockTime(l.started_at)}</span>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: c, animation: l.status === "running" || l.status === "pending" ? "pulse 1.5s infinite" : "none" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {hasDetail ? (
                      <span style={{ width: 12, color: D.faint, fontSize: 10, transition: "transform .15s", transform: isExpanded ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>
                    ) : <span style={{ width: 12 }} />}
                    <span style={{ color: "#fff", fontFamily: "Geist", fontWeight: 500 }}>{jobName(l.job_id) ?? `job #${l.job_id}`}</span>
                  </div>
                  <span style={{ color: D.sub }}>{computerName(l.computer_id) ?? "—"}</span>
                  <span style={{ color: D.cyan, textTransform: "uppercase", fontSize: 10, letterSpacing: ".08em" }}>{l.triggered_by}</span>
                  <span style={{ color: D.ink }}>↑{l.files_copied} ↷{l.files_skipped} ✕{l.files_failed}</span>
                  <span style={{ color: D.faint, textAlign: "right" }}>{duration(l.started_at, l.completed_at)}</span>
                </div>
                {isExpanded ? <ExpandedDetails log={l} /> : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
