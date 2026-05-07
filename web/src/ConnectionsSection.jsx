import { useEffect, useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { UI, InstIcon } from "./icons";


const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(0,0,0,.30)",
  color: "#fff",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "Geist Mono",
};


function StatusBadge({ kind, label }) {
  const colors = {
    connected: { fg: D.ok, bg: "rgba(74,222,128,.14)", border: "rgba(74,222,128,.36)" },
    pending:   { fg: D.warn, bg: "rgba(250,204,21,.10)", border: "rgba(250,204,21,.32)" },
    none:      { fg: D.faint, bg: "rgba(255,255,255,.04)", border: "rgba(255,255,255,.10)" },
    soon:      { fg: D.faint, bg: "rgba(255,255,255,.02)", border: "rgba(255,255,255,.06)" },
  };
  const c = colors[kind] || colors.none;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 999,
      background: c.bg, border: `1px solid ${c.border}`, color: c.fg,
      fontSize: 9, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: c.fg }} />
      {label}
    </span>
  );
}


function GitConnector({ open, onToggle }) {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pullResult, setPullResult] = useState("");
  const [copied, setCopied] = useState(false);

  async function refresh() {
    try { setInfo(await api.repoInfo()); } catch { /* ignore */ }
  }
  useEffect(() => { if (open) refresh(); }, [open]);

  async function pull() {
    setBusy(true); setPullResult("");
    try {
      const r = await api.repoPull();
      setPullResult(r.ok
        ? `✓ ${r.stdout || "Up to date."}`
        : `✕ ${r.stderr || r.stdout || "git pull failed"}`);
      await refresh();
    } catch (err) {
      setPullResult(`✕ ${err.message}`);
    } finally { setBusy(false); }
  }

  function copyKey() {
    if (!info?.ssh_pubkey) return;
    navigator.clipboard.writeText(info.ssh_pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const status = !info ? "pending" : (info.in_git ? "connected" : "none");
  const statusLabel = !info ? "checking…" : (info.in_git ? "in repo" : "not a git repo");

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", color: D.ink, textAlign: "left" }}
      >
        <span style={{ width: 26, color: D.cyan, display: "grid", placeItems: "center" }}>
          <InstIcon lucideName="git-branch" size={20} color={D.cyan} />
        </span>
        <span style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Git</div>
          <div style={{ fontSize: 10, color: D.sub, marginTop: 2 }}>
            Source updates · SSH key · pull-and-deploy
          </div>
        </span>
        <StatusBadge kind={status} label={statusLabel} />
        <span style={{ fontSize: 9, color: D.faint, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block", width: 8, textAlign: "center" }}>▶</span>
      </button>
      {open ? (
        <div style={{ padding: "0 14px 14px 52px" }}>
          {info ? (
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 6, fontSize: 11, color: D.sub, marginBottom: 12 }}>
              <span>Branch</span>
              <span style={{ color: D.ink, fontFamily: "Geist Mono" }}>{info.branch || "—"}</span>
              <span>Commit</span>
              <span style={{ color: D.ink, fontFamily: "Geist Mono" }}>
                {info.commit || "—"}
                {info.dirty ? <span style={{ color: D.warn, marginLeft: 6 }}>· uncommitted changes</span> : null}
              </span>
              <span>Last commit</span>
              <span style={{ color: D.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {info.last_commit_message || "—"}
              </span>
              <span>Remote</span>
              <span style={{ color: D.ink, fontFamily: "Geist Mono", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {info.remote_url || <em style={{ color: D.faint }}>not set</em>}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: D.faint, padding: "8px 0" }}>Loading…</div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={{ fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>
                Pi's SSH public key {info?.ssh_pubkey_path ? <span style={{ color: D.faint, textTransform: "none", letterSpacing: 0 }}>· {info.ssh_pubkey_path}</span> : null}
              </label>
              {info?.ssh_pubkey ? (
                <button
                  onClick={copyKey}
                  style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
                >
                  {copied ? "✓ copied" : "Copy"}
                </button>
              ) : null}
            </div>
            {info?.ssh_pubkey ? (
              <textarea
                value={info.ssh_pubkey}
                readOnly
                rows={2}
                style={{ ...inputStyle, fontSize: 10, resize: "vertical", minHeight: 50 }}
              />
            ) : (
              <div style={{ fontSize: 11, color: D.faint, padding: "8px 0" }}>
                No SSH key found. On the Pi run <code style={{ color: D.cyan }}>ssh-keygen -t ed25519</code> to create one,
                then refresh this panel and paste the result into <strong style={{ color: D.cyan }}>GitHub → Settings → SSH keys</strong>.
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={pull}
              disabled={busy || !info?.in_git}
              title="git pull --ff-only on the orchestrator"
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, fontSize: 12, fontWeight: 700, cursor: (busy || !info?.in_git) ? "not-allowed" : "pointer" }}
            >
              {busy ? "Pulling…" : "Pull from remote"}
            </button>
            {pullResult ? (
              <span style={{ fontSize: 11, color: pullResult.startsWith("✓") ? D.ok : D.bad, fontFamily: "Geist Mono" }}>
                {pullResult}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: D.faint }}>
                Restart the service manually if Python or schema changed.
              </span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}


function SlackConnector({ open, onToggle, settings, patch, save, dirty }) {
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const configured = !!(settings?.slack_webhook_url || "").trim();

  async function test() {
    setTesting(true); setTestMsg("");
    try {
      const r = await api.testNotify();
      setTestMsg(r.detail ? `✓ ${r.detail}` : "✓ delivered");
    } catch (err) { setTestMsg(`✕ ${err.message}`); }
    finally { setTesting(false); setTimeout(() => setTestMsg(""), 4000); }
  }

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.05)" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", color: D.ink, textAlign: "left" }}
      >
        <span style={{ width: 26, color: D.cyan, display: "grid", placeItems: "center" }}>
          <InstIcon lucideName="message-square" size={20} color={D.cyan} />
        </span>
        <span style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Slack</div>
          <div style={{ fontSize: 10, color: D.sub, marginTop: 2 }}>
            Outgoing webhook for sync/agent/storage alerts
          </div>
        </span>
        <StatusBadge kind={configured ? "connected" : "none"} label={configured ? "configured" : "not set"} />
        <span style={{ fontSize: 9, color: D.faint, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", display: "inline-block", width: 8, textAlign: "center" }}>▶</span>
      </button>
      {open ? (
        <div style={{ padding: "0 14px 14px 52px" }}>
          <label style={{ fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 4 }}>
            Webhook URL
          </label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <input
              type="password"
              value={settings?.slack_webhook_url || ""}
              onChange={(e) => patch("slack_webhook_url", e.target.value)}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={save}
              disabled={!dirty}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: dirty ? `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})` : "rgba(255,255,255,.06)", color: dirty ? "#052432" : D.faint, fontSize: 11, fontWeight: 700, cursor: dirty ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}
            >
              Save
            </button>
            <button
              onClick={test}
              disabled={testing || dirty || !configured}
              title={dirty ? "Save first" : "Send a test ping"}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, fontSize: 11, fontWeight: 700, cursor: (testing || dirty || !configured) ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
            >
              {testing ? "Testing…" : "Test"}
            </button>
          </div>
          {testMsg ? (
            <div style={{ fontSize: 11, color: testMsg.startsWith("✓") ? D.ok : D.bad, fontFamily: "Geist Mono", marginBottom: 10 }}>{testMsg}</div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11, color: D.ink }}>
            {[
              ["slack_notify_failure", "Failures"],
              ["slack_notify_success", "Successes"],
              ["slack_notify_manual",  "Manual triggers"],
            ].map(([k, label]) => (
              <label key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!settings?.[k]}
                  onChange={() => patch(k, !settings?.[k])}
                  style={{ accentColor: D.cyan }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}


function ComingSoonRow({ name, lucide, why }) {
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", opacity: 0.55 }}>
      <span style={{ width: 26, color: D.faint, display: "grid", placeItems: "center" }}>
        <InstIcon lucideName={lucide} size={20} color={D.faint} />
      </span>
      <span style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: D.sub }}>{name}</div>
        <div style={{ fontSize: 10, color: D.faint, marginTop: 2 }}>{why}</div>
      </span>
      <StatusBadge kind="soon" label="coming soon" />
    </div>
  );
}


export default function ConnectionsSection({ settings, patch, save, dirty }) {
  const [openId, setOpenId] = useState(null);
  function toggle(id) { setOpenId((cur) => (cur === id ? null : id)); }

  return (
    <div style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 22, marginBottom: 14 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#fff" }}>Connections</h2>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: D.sub }}>
        External integrations — wire up source updates, alerts, and (eventually) cloud-storage destinations.
      </p>
      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
        <GitConnector open={openId === "git"} onToggle={() => toggle("git")} />
        <SlackConnector
          open={openId === "slack"}
          onToggle={() => toggle("slack")}
          settings={settings}
          patch={patch}
          save={save}
          dirty={dirty}
        />
        <ComingSoonRow name="Box" lucide="box" why="Sync target — push files to a Box folder instead of (or alongside) the NAS." />
        <ComingSoonRow name="Dropbox" lucide="cloud" why="Sync target — push files to a Dropbox folder." />
        <ComingSoonRow name="Google Drive" lucide="hard-drive" why="Sync target — push files to a Google Drive folder." />
      </div>
    </div>
  );
}
