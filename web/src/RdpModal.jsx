import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { UI } from "./icons";

export default function RdpModal({ computer, onClose, sessionFetcher, protocol }) {
  // `sessionFetcher` lets non-Computer targets (the Pi host itself) reuse this
  // modal — pass a 0-arg promise that returns the same shape api.rdpSession
  // returns. `protocol` overrides label copy ("rdp" or "vnc"). Default reads
  // from computer.remote_protocol, falling back to "rdp" for legacy rows.
  const proto = (protocol || computer?.remote_protocol || "rdp").toLowerCase();
  const isVnc = proto === "vnc";
  const labels = isVnc
    ? {
        kind: "VNC",
        title: "Remote Screen",
        loading: "Starting VNC session…",
        passwordHint: "First connect prompts for your VNC password (cached after that).",
        fallbackOffer: null,
      }
    : {
        kind: "RDP",
        title: "Remote Desktop",
        loading: "Starting Guacamole session…",
        passwordHint: "Username pre-filled as you. First connect prompts for your Windows password.",
        fallbackOffer: "rdp",
      };
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState(false);
  const containerRef = useRef(null);

  function goFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  }

  useEffect(() => {
    if (!computer) return;
    let alive = true;
    const fetcher = sessionFetcher ?? (() => api.rdpSession(computer.id));
    fetcher()
      .then((s) => { if (alive) setSession(s); })
      .catch((err) => { if (alive) setError(err.message || "Failed to start session"); });
    return () => { alive = false; };
  }, [computer, sessionFetcher]);

  if (!computer) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,8,17,0.80)",
        backdropFilter: "blur(6px)",
        zIndex: 200,
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "95vw",
          height: "92vh",
          background: D.glass,
          border: D.glassBorder,
          borderRadius: 18,
          boxShadow: "0 30px 90px rgba(0,0,0,.55)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: D.cyan }}><UI name="server" size={16} /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: D.cyan, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>{labels.title} · {labels.kind}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginTop: 1 }}>
              {computer.name}
              {computer.ip_address ? (
                <span style={{ color: D.faint, fontFamily: "Geist Mono", fontSize: 11 }}> · {computer.ip_address}</span>
              ) : null}
            </div>
          </div>
          {session?.url ? (
            <>
              <button
                onClick={goFullscreen}
                title="Fullscreen (Esc to exit)"
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.sub, fontSize: 11, cursor: "pointer" }}
              >
                ⛶ Fullscreen
              </button>
              <a
                href={session.url}
                target="_blank"
                rel="noreferrer"
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.sub, fontSize: 11, textDecoration: "none" }}
                title="Pop into a new tab"
              >
                ↗ Pop out
              </a>
            </>
          ) : null}
          <button
            onClick={onClose}
            title="Close"
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.sub, cursor: "pointer", display: "grid", placeItems: "center" }}
          >
            <UI name="x" size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, position: "relative", background: "#000" }}>
          {error ? (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 24 }}>
              <div style={{ maxWidth: 480, padding: 20, borderRadius: 12, border: "1px solid rgba(244,63,94,.30)", background: "rgba(244,63,94,.08)", color: D.ink, fontSize: 13 }}>
                <div style={{ color: D.bad, fontWeight: 700, marginBottom: 6 }}>Couldn't start a browser session.</div>
                <div style={{ color: D.sub, marginBottom: 12, fontFamily: "Geist Mono", fontSize: 12 }}>{error}</div>
                {labels.fallbackOffer === "rdp" && typeof computer.id === "number" ? (
                  <>
                    <div style={{ color: D.sub, fontSize: 12, marginBottom: 12 }}>
                      Falling back to a downloadable <code style={{ color: D.cyan }}>.rdp</code> file —
                      open it with the Windows Remote Desktop client.
                    </div>
                    <a
                      href={api.rdpUrl(computer.id)}
                      style={{ display: "inline-block", padding: "8px 14px", borderRadius: 8, border: "none", background: `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})`, color: "#052432", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
                    >
                      Download .rdp
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          ) : !session ? (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: D.sub, fontSize: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: D.cyan, animation: "pulse 1.2s ease-in-out infinite" }} />
                {labels.loading}
              </div>
            </div>
          ) : (
            <iframe
              title={`${labels.kind} · ${computer.name}`}
              src={session.url}
              allow="clipboard-read; clipboard-write; fullscreen"
              style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#000" }}
            />
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 18px", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 11, color: D.faint, fontFamily: "Geist Mono" }}>
          {labels.passwordHint} Press <kbd style={{ padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.10)" }}>Esc</kbd> outside the window to close.
        </div>
      </div>
    </div>
  );
}
