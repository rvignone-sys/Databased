import { useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { UI } from "./icons";
import CompareModal from "./CompareModal";

function formatBytes(b) {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function severityForCount(n) {
  if (n == null) return D.cyan;
  if (n > 100_000) return D.bad;
  if (n > 10_000) return D.warn;
  return D.cyan;
}

function severityForBytes(b) {
  if (b == null) return D.cyan;
  if (b > 500 * 1024 ** 3) return D.bad;     // >500 GB
  if (b > 50 * 1024 ** 3) return D.warn;      // >50 GB
  return D.cyan;
}

function ExtList({ json }) {
  if (!json) return null;
  let parsed;
  try { parsed = JSON.parse(json); } catch { return null; }
  const entries = Object.entries(parsed).slice(0, 6);
  if (!entries.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {entries.map(([ext, count]) => (
        <span key={ext} style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,.06)", fontFamily: "Geist Mono", fontSize: 9, color: D.sub }}>
          {ext} <span style={{ color: D.faint }}>×{count}</span>
        </span>
      ))}
    </div>
  );
}

function ReviewRow({ job, computerName, onApprove, onReject, onCompare }) {
  const [busy, setBusy] = useState(false);
  const status = job.analyze_status;
  const isReady = status === "complete";
  const isFailed = status === "failed";

  async function approve() {
    setBusy(true);
    try { await onApprove(); } finally { setBusy(false); }
  }
  async function reject() {
    if (!window.confirm(`Reject and delete sync job "${job.name}"?`)) return;
    setBusy(true);
    try { await onReject(); } finally { setBusy(false); }
  }

  return (
    <div style={{ paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,.05)", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.name}</div>
          <div style={{ fontSize: 10, color: D.sub, fontFamily: "Geist Mono", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {computerName ?? "—"} · {job.source_folder_path}
          </div>
        </div>
      </div>

      {status === "pending" || status === "running" ? (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: D.cyan }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: D.cyan, animation: "pulse 1.5s ease-in-out infinite" }} />
          Scanning source folder…
        </div>
      ) : null}

      {isFailed ? (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: "rgba(244,63,94,.10)", border: "1px solid rgba(244,63,94,.18)", color: D.bad, fontSize: 11 }}>
          Analysis failed: {job.analyze_error || "unknown"}
        </div>
      ) : null}

      {isReady ? (
        <>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 8, borderRadius: 8, background: "rgba(0,0,0,.20)", border: "1px solid rgba(255,255,255,.06)" }}>
            <div>
              <div style={{ fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase" }}>Files</div>
              <div style={{ fontFamily: "Geist Mono", fontSize: 14, fontWeight: 700, color: severityForCount(job.analyze_file_count) }}>
                {(job.analyze_file_count ?? 0).toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase" }}>Total size</div>
              <div style={{ fontFamily: "Geist Mono", fontSize: 14, fontWeight: 700, color: severityForBytes(job.analyze_total_bytes) }}>
                {formatBytes(job.analyze_total_bytes)}
              </div>
            </div>
            {job.analyze_largest_file ? (
              <div style={{ gridColumn: "1 / span 2" }}>
                <div style={{ fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase" }}>Largest</div>
                <div style={{ fontFamily: "Geist Mono", fontSize: 11, color: D.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {job.analyze_largest_file} <span style={{ color: D.sub }}>({formatBytes(job.analyze_largest_file_bytes)})</span>
                </div>
              </div>
            ) : null}
          </div>
          <ExtList json={job.analyze_extensions} />
          {job.analyze_truncated ? (
            <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 6, background: "rgba(250,204,21,.10)", border: "1px solid rgba(250,204,21,.20)", color: D.warn, fontSize: 10 }}>
              ⚠ Scan capped (folder is large) — counts/size are a lower bound.
            </div>
          ) : null}
        </>
      ) : null}

      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <button
          onClick={onCompare}
          disabled={busy}
          title="Preview new/changed/unchanged files before enabling"
          style={{
            padding: "6px 10px", borderRadius: 7, border: `1px solid ${D.accentBorder}`,
            background: D.accentBg, color: D.cyan,
            fontSize: 11, fontWeight: 700,
            cursor: busy ? "default" : "pointer",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <UI name="search" size={11} /> Compare
        </button>
        <button
          onClick={approve}
          disabled={busy || (!isReady && !isFailed)}
          title={isReady ? "Enable this sync job" : "Wait for analysis to finish first"}
          style={{
            flex: 1, padding: "6px 10px", borderRadius: 7, border: "none",
            background: isReady && !busy ? `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})` : "rgba(255,255,255,.06)",
            color: isReady && !busy ? "#052432" : D.faint,
            fontSize: 11, fontWeight: 700, cursor: isReady && !busy ? "pointer" : "default",
          }}
        >
          {busy ? "…" : isReady ? "Approve" : "Pending…"}
        </button>
        <button
          onClick={reject}
          disabled={busy}
          style={{
            padding: "6px 10px", borderRadius: 7, border: "1px solid rgba(251,113,133,.30)",
            background: "transparent", color: D.bad, fontSize: 11, fontWeight: 700,
            cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <UI name="trash" size={11} /> Reject
        </button>
      </div>
    </div>
  );
}

export default function PendingReview({ jobs, computers, onChange }) {
  const [comparing, setComparing] = useState(null);
  const reviewable = jobs.filter((j) =>
    !j.enabled && (j.analyze_status === "pending" || j.analyze_status === "complete" || j.analyze_status === "failed" || j.analyze_status === "running")
  );
  if (!reviewable.length) return null;

  const compName = (id) => computers.find((c) => c.id === id)?.name;
  const compFor = (id) => computers.find((c) => c.id === id);

  async function approve(j) {
    await api.updateJob(j.id, { enabled: true });
    onChange?.();
  }
  async function reject(j) {
    await api.deleteJob(j.id);
    onChange?.();
  }

  return (
    <section style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#fff" }}>Pending Review</h2>
        <span style={{ fontSize: 9, color: D.warn, fontWeight: 700, letterSpacing: ".08em" }}>{reviewable.length}</span>
      </div>
      <div style={{ fontSize: 10, color: D.sub, marginBottom: 10, lineHeight: 1.4 }}>
        New sync jobs are scanned before going live so an oversized folder can't slip in unnoticed. Click <strong style={{ color: D.cyan }}>Compare</strong> to preview files first.
      </div>
      {reviewable.map((j) => (
        <ReviewRow
          key={j.id}
          job={j}
          computerName={compName(j.source_computer_id)}
          onApprove={() => approve(j)}
          onReject={() => reject(j)}
          onCompare={() => setComparing({ job: j, computer: compFor(j.source_computer_id) })}
        />
      ))}
      {comparing ? (
        <CompareModal
          job={comparing.job}
          computer={comparing.computer}
          isAdmin={true}
          onSync={async () => { await api.triggerJob(comparing.job.id); onChange?.(); }}
          onClose={() => setComparing(null)}
        />
      ) : null}
    </section>
  );
}
