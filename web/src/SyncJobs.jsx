import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { D, logStatusColor, ICON_LABELS } from "./theme";
import { UI } from "./icons";
import { shortRelative, duration } from "./format";
import JobModal from "./JobModal";
import CompareModal from "./CompareModal";

function jobLastRun(logs, jobId) {
  const matches = logs.filter((l) => l.job_id === jobId).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  if (!matches.length) return { rel: "never", status: null, dur: "—" };
  const latest = matches[0];
  return {
    rel: shortRelative(latest.started_at),
    status: latest.status,
    dur: duration(latest.started_at, latest.completed_at),
  };
}

function jobAvgDuration(logs, jobId) {
  const finished = logs.filter((l) => l.job_id === jobId && l.completed_at);
  if (!finished.length) return "—";
  const total = finished.reduce((s, l) => s + (new Date(l.completed_at) - new Date(l.started_at)), 0);
  const avg = Math.floor(total / finished.length / 1000);
  return `${Math.floor(avg / 60)}m ${(avg % 60).toString().padStart(2, "0")}s`;
}

function jobRuns(logs, jobId) {
  return logs.filter((l) => l.job_id === jobId).length;
}

function ToggleSwitch({ on, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 28,
        height: 16,
        borderRadius: 999,
        background: on ? D.cyan : "rgba(255,255,255,.10)",
        position: "relative",
        cursor: "pointer",
        transition: "all .2s",
      }}
    >
      <div style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 12, height: 12, borderRadius: 999, background: "#fff", transition: "all .2s" }} />
    </div>
  );
}

export default function SyncJobs({ isAdmin }) {
  const [jobs, setJobs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [computers, setComputers] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // job object | "new" | null
  const [comparing, setComparing] = useState(null); // {job, computer}

  async function refresh() {
    try {
      const [j, l, c] = await Promise.all([api.jobs(), api.logs({ limit: 500 }), api.computers()]);
      setJobs(j);
      setLogs(l);
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

  const enabledCount = jobs.filter((j) => j.enabled).length;
  const runningCount = logs.filter((l) => l.status === "running" || l.status === "pending").length;
  const computerName = useMemo(() => {
    const m = {};
    for (const c of computers) m[c.id] = c.name;
    return m;
  }, [computers]);
  // Map computer id → "Name · Category" so the Source column matches the
  // dashboard card format. Category prefers the per-device override
  // (computers.category), falling back to the InstrumentType label.
  const computerLabel = useMemo(() => {
    const m = {};
    for (const c of computers) {
      const category = (c.category && c.category.trim())
        ? c.category.trim()
        : (ICON_LABELS[c.icon_type] || "");
      m[c.id] = category ? `${c.name} · ${category}` : c.name;
    }
    return m;
  }, [computers]);

  async function trigger(jobId) {
    try { await api.triggerJob(jobId); await refresh(); }
    catch (err) { setError(err.message); }
  }
  async function toggleEnabled(j) {
    try { await api.updateJob(j.id, { enabled: !j.enabled }); await refresh(); }
    catch (err) { setError(err.message); }
  }
  async function deleteJob(j) {
    if (!window.confirm(`Delete sync job "${j.name}"?\n\nLog history will remain but the job stops running.`)) return;
    try { await api.deleteJob(j.id); await refresh(); }
    catch (err) { setError(err.message); }
  }
  const approvedComputers = useMemo(() => computers.filter((c) => c.status === "approved"), [computers]);

  return (
    <div style={{ background: D.glass, border: D.glassBorder, borderRadius: 18, padding: 18, flex: 1, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: D.cyan, fontWeight: 700, letterSpacing: ".12em" }}>SYNC MANAGER / JOBS</div>
          <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, color: "#fff", letterSpacing: "-.02em" }}>Sync Jobs</h1>
          <div style={{ fontSize: 12, color: D.sub, marginTop: 3 }}>
            {enabledCount} of {jobs.length} jobs enabled · {runningCount} running now
          </div>
        </div>
        {isAdmin ? (
          <button
            onClick={() => setEditing("new")}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(103,232,249,.32)", background: "rgba(34,211,238,.10)", color: D.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            <UI name="plus" size={14} /> New Sync Job
          </button>
        ) : null}
      </div>

      {error ? (
        <div style={{ color: D.bad, padding: 12, borderRadius: 10, background: "rgba(244,63,94,.10)", marginBottom: 12, fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      <div style={{ background: "rgba(0,0,0,.10)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "32px 2fr 1fr 1fr 1.4fr 1fr 1fr 100px", gap: 10, padding: "12px 18px", background: "rgba(0,0,0,.18)", fontSize: 10, fontWeight: 700, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase" }}>
          <span></span><span>Job Name</span><span>Source</span><span>Mode · Conflict</span><span>Schedule</span><span>Last Run</span><span>Avg Duration</span><span style={{ textAlign: "right" }}>Actions</span>
        </div>
        {jobs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: D.sub, fontSize: 13 }}>
            No sync jobs yet. Click <strong style={{ color: D.cyan }}>New Sync Job</strong> to create one.
          </div>
        ) : (
          jobs.map((j) => {
            const last = jobLastRun(logs, j.id);
            const c = last.status ? logStatusColor(last.status) : D.faint;
            return (
              <div key={j.id} style={{ display: "grid", gridTemplateColumns: "32px 2fr 1fr 1fr 1.4fr 1fr 1fr 100px", gap: 10, padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,.05)", alignItems: "center", fontSize: 12 }}>
                <ToggleSwitch on={j.enabled} onChange={() => isAdmin && toggleEnabled(j)} />
                <div>
                  <div style={{ fontWeight: 600, color: "#fff" }}>{j.name}</div>
                  <div style={{ fontSize: 10, color: D.faint, fontFamily: "Geist Mono", marginTop: 2 }}>
                    #{j.id.toString().padStart(4, "0")} · {jobRuns(logs, j.id)} runs
                  </div>
                </div>
                <div style={{ fontFamily: "Geist Mono", color: D.ink, fontSize: 11 }}>{computerLabel[j.source_computer_id] ?? "—"}</div>
                <div style={{ color: D.sub }}>
                  <div style={{ fontWeight: 600, color: D.ink }}>{j.sync_direction}</div>
                  <div style={{ fontSize: 10, marginTop: 2 }}>conflict: {j.conflict_handling}</div>
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: D.ink }}>
                  <UI name="calendar" size={12} />
                  <span style={{ fontFamily: "Geist Mono", fontSize: 11 }}>
                    {j.watch_mode_enabled ? `Watch · ${j.watch_mode_delay_seconds}s` : j.schedule_cron || "Manual"}
                  </span>
                </div>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: c, animation: last.status === "running" || last.status === "pending" ? "pulse 1.5s infinite" : "none" }} />
                    <span style={{ fontSize: 11, color: c, fontWeight: 600, textTransform: "capitalize" }}>{last.status ?? "—"}</span>
                  </div>
                  <div style={{ fontSize: 10, color: D.faint, fontFamily: "Geist Mono", marginTop: 2 }}>{last.rel}</div>
                </div>
                <div style={{ fontFamily: "Geist Mono", fontSize: 11, color: D.sub }}>{jobAvgDuration(logs, j.id)}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                  {isAdmin ? (
                    <>
                      <button
                        onClick={() => setComparing({ job: j, computer: computers.find((c) => c.id === j.source_computer_id) })}
                        title="Compare & sync"
                        style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.cyan, cursor: "pointer", display: "grid", placeItems: "center" }}
                      >
                        <UI name="search" size={11} />
                      </button>
                      <button onClick={() => trigger(j.id)} title="Trigger sync (no compare)" style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.ink, cursor: "pointer", display: "grid", placeItems: "center" }}>
                        <UI name="play" size={11} />
                      </button>
                      <button onClick={() => setEditing(j)} title="Edit" style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.ink, cursor: "pointer", display: "grid", placeItems: "center" }}>
                        <UI name="edit" size={11} />
                      </button>
                      <button onClick={() => deleteJob(j)} title="Delete" style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.bad, cursor: "pointer", display: "grid", placeItems: "center" }}>
                        <UI name="trash" size={11} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing ? (
        <JobModal
          job={editing === "new" ? null : editing}
          computers={approvedComputers}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}

      {comparing ? (
        <CompareModal
          job={comparing.job}
          computer={comparing.computer}
          isAdmin={isAdmin}
          onSync={async () => { await trigger(comparing.job.id); }}
          onClose={() => setComparing(null)}
        />
      ) : null}
    </div>
  );
}
