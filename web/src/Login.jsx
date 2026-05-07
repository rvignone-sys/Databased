import { useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { UI } from "./icons";

export default function Login({ onAuthed }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const me = await api.login(username, password, remember);
      onAuthed(me);
    } catch (err) {
      setError(err.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: D.bg, color: D.ink, display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
      {/* ambient grid */}
      <svg style={{ position: "absolute", inset: 0, opacity: 0.2 }} width="100%" height="100%">
        <defs>
          <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke={D.cyan} strokeWidth=".4" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>

      <form
        onSubmit={submit}
        style={{ width: 380, padding: 32, borderRadius: 20, background: D.glass, border: D.glassBorder, boxShadow: "0 30px 90px rgba(0,0,0,.4)", position: "relative", zIndex: 1 }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(34,211,238,.12)", border: "1px solid rgba(103,232,249,.28)", display: "grid", placeItems: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 3 L19 7 L19 17 L12 21 L5 17 L5 7 Z" stroke={D.cyan} strokeWidth="1.6" />
              <circle cx="12" cy="12" r="3" fill={D.cyan} />
            </svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>DataBased</div>
            <div style={{ fontSize: 10, color: D.cyan, fontWeight: 700, letterSpacing: ".16em", marginTop: 2 }}>SYNC MANAGER</div>
          </div>
        </div>

        <h1 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#fff", textAlign: "center" }}>Sign in to continue</h1>
        <p style={{ margin: "0 0 22px", fontSize: 12, color: D.sub, textAlign: "center" }}>Authenticated against the Pi orchestrator</p>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", display: "block", marginBottom: 6, fontWeight: 700 }}>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
            style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(0,0,0,.30)", color: "#fff", fontSize: 13, fontFamily: "Geist", outline: "none" }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 10, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", display: "block", marginBottom: 6, fontWeight: 700 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "rgba(0,0,0,.30)", color: "#fff", fontSize: 13, fontFamily: "Geist Mono", outline: "none" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, marginBottom: 18 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, color: D.sub, cursor: "pointer" }}>
            <span
              onClick={() => setRemember((r) => !r)}
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                border: `1.5px solid ${D.cyan}`,
                background: remember ? "rgba(34,211,238,.16)" : "transparent",
                display: "grid",
                placeItems: "center",
                color: D.cyan,
              }}
            >
              {remember ? <UI name="check" size={10} /> : null}
            </span>
            Keep me signed in
          </label>
        </div>

        {error ? (
          <div style={{ color: D.bad, fontSize: 12, padding: "8px 10px", background: "rgba(244,63,94,.10)", borderRadius: 8, marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          style={{ width: "100%", padding: "12px", borderRadius: 11, border: "none", background: `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})`, color: "#052432", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", letterSpacing: ".02em" }}
        >
          {busy ? "Signing in…" : "Sign In →"}
        </button>

        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.05)", display: "flex", justifyContent: "space-between", fontSize: 10, color: D.faint, fontFamily: "Geist Mono" }}>
          <span>v0.1.0</span>
          <span>● Pi Orchestrator · OK</span>
        </div>
      </form>
    </div>
  );
}
