import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { UI } from "./icons";

function formatBytes(b) {
  if (b == null || b < 0) return "—";
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function FileRow({ children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", fontFamily: "Geist Mono", fontSize: 11, color: D.ink, borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      {children}
    </div>
  );
}

function Section({ title, color, count, files, renderRow, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const list = files ? (() => { try { return JSON.parse(files); } catch { return []; } })() : [];
  return (
    <div style={{ marginBottom: 10, borderRadius: 10, border: `1px solid ${color}33`, background: `${color}0A`, overflow: "hidden" }}>
      <div
        onClick={() => count > 0 && setOpen((v) => !v)}
        style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: count > 0 ? "pointer" : "default", borderBottom: open ? `1px solid ${color}22` : "none" }}
      >
        {count > 0 ? (
          <span style={{ width: 10, color, fontSize: 11, transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>
        ) : <span style={{ width: 10 }} />}
        <span style={{ color, fontWeight: 700, fontSize: 13, letterSpacing: ".02em" }}>{title}</span>
        <span style={{ marginLeft: "auto", color, fontFamily: "Geist Mono", fontWeight: 700, fontSize: 13 }}>({count.toLocaleString()})</span>
      </div>
      {open ? (
        <div style={{ maxHeight: 220, overflow: "auto", background: "rgba(0,0,0,.18)" }}>
          {list.length === 0 ? (
            <div style={{ padding: 12, color: D.faint, fontSize: 11, textAlign: "center" }}>(no preview available)</div>
          ) : list.map(renderRow)}
          {list.length < count ? (
            <div style={{ padding: "6px 14px", fontSize: 10, color: D.faint, fontStyle: "italic" }}>
              … {(count - list.length).toLocaleString()} more not shown
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function CompareModal({ job, computer, onClose, onSync, isAdmin }) {
  const [compare, setCompare] = useState(null);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!job) return;
    let alive = true;
    (async () => {
      try {
        const created = await api.startCompare(job.id);
        if (!alive) return;
        setCompare(created);
        // Poll for completion
        pollRef.current = setInterval(async () => {
          try {
            const fresh = await api.getCompare(created.id);
            if (!alive) return;
            setCompare(fresh);
            if (fresh.status === "complete" || fresh.status === "failed") {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          } catch (err) { /* keep polling */ }
        }, 1500);
      } catch (err) {
        if (alive) setError(err.message);
      }
    })();
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [job]);

  async function doSync() {
    setSyncing(true);
    try {
      await onSync();
      onClose();
    } catch (err) {
      setError(err.message);
      setSyncing(false);
    }
  }

  if (!job) return null;
  const isDone = compare && compare.status === "complete";
  const isFailed = compare && compare.status === "failed";
  const isRunning = !compare || compare.status === "pending" || compare.status === "running";
  const totalToSync = (compare?.new_count || 0) + (compare?.changed_count || 0);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(2,8,17,0.78)", backdropFilter: "blur(6px)", zIndex: 150, display: "grid", placeItems: "center", padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto", background: D.glass, border: D.glassBorder, borderRadius: 18, boxShadow: "0 30px 90px rgba(0,0,0,.55)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 10, color: D.cyan, fontWeight: 700, letterSpacing: ".12em" }}>COMPARE & SYNC</div>
            <h2 style={{ margin: "2px 0 4px", color: "#fff", fontSize: 17, fontWeight: 700 }}>{job.name}</h2>
            <div style={{ fontSize: 11, color: D.sub, fontFamily: "Geist Mono" }}>
              {computer?.name ?? ""} · {job.source_folder_path} → {job.target_folder_path}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.sub, cursor: "pointer", display: "grid", placeItems: "center" }}>
            <UI name="x" size={14} />
          </button>
        </div>

        <div style={{ padding: "16px 22px", flex: 1 }}>
          {error ? (
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(244,63,94,.10)", border: "1px solid rgba(244,63,94,.18)", color: D.bad, fontSize: 12 }}>
              {error}
            </div>
          ) : null}

          {isRunning ? (
            <div style={{ padding: 28, textAlign: "center", color: D.sub, fontSize: 13 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: D.cyan, animation: "pulse 1.2s ease-in-out infinite" }} />
                Walking source and target folders…
              </span>
              <div style={{ fontSize: 11, color: D.faint, marginTop: 8 }}>Caps at 200K files / 90s.</div>
            </div>
          ) : null}

          {isFailed ? (
            <div style={{ padding: 14, borderRadius: 10, background: "rgba(244,63,94,.10)", border: "1px solid rgba(244,63,94,.18)", color: D.bad, fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Comparison failed</div>
              {compare?.error_message || "(no detail)"}
            </div>
          ) : null}

          {isDone ? (
            <>
              {compare.truncated ? (
                <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(250,204,21,.10)", border: "1px solid rgba(250,204,21,.20)", color: D.warn, fontSize: 11 }}>
                  ⚠ Scan capped — folder is large. Counts may be a lower bound.
                </div>
              ) : null}

              <Section
                title="New files"
                color={D.ok}
                count={compare.new_count}
                files={compare.new_files}
                defaultOpen={compare.new_count > 0 && compare.new_count <= 50}
                renderRow={(f, i) => (
                  <FileRow key={i}>
                    <span style={{ color: D.ok }}>{f.path}</span>
                    <span style={{ color: D.sub }}>{formatBytes(f.size)}</span>
                  </FileRow>
                )}
              />
              <Section
                title="Changed (sizes differ)"
                color={D.warn}
                count={compare.changed_count}
                files={compare.changed_files}
                defaultOpen={compare.changed_count > 0 && compare.changed_count <= 50}
                renderRow={(f, i) => (
                  <FileRow key={i}>
                    <span style={{ color: D.warn }}>{f.path}</span>
                    <span style={{ color: D.sub }}>{formatBytes(f.src_size)} → {formatBytes(f.dst_size)}</span>
                  </FileRow>
                )}
              />
              <Section
                title="Unchanged"
                color={D.faint}
                count={compare.unchanged_count}
                files={compare.unchanged_files}
                renderRow={(f, i) => (
                  <FileRow key={i}>
                    <span style={{ color: D.sub }}>{f.path}</span>
                    <span style={{ color: D.faint }}>{formatBytes(f.size)}</span>
                  </FileRow>
                )}
              />
            </>
          ) : null}
        </div>

        <div style={{ padding: "12px 22px", borderTop: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 11, color: D.faint }}>
            {isDone ? `Sync will respect this job's conflict mode (${job.conflict_handling || "skip"}).` : ""}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: D.ink, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            {isAdmin ? (
              <button
                onClick={doSync}
                disabled={!isDone || syncing || totalToSync === 0}
                title={totalToSync === 0 ? "Nothing to sync" : `${totalToSync.toLocaleString()} files queued (sync respects conflict mode)`}
                style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: (isDone && totalToSync > 0 && !syncing) ? `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})` : "rgba(255,255,255,.06)", color: (isDone && totalToSync > 0 && !syncing) ? "#052432" : D.faint, fontSize: 12, fontWeight: 700, cursor: (isDone && totalToSync > 0 && !syncing) ? "pointer" : "default" }}
              >
                {syncing ? "Triggering…" : isDone ? `Sync ${totalToSync.toLocaleString()} file(s)` : "Sync"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
