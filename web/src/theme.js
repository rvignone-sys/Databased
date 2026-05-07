// Dark glass palette ported from Direction A · Dark, plus a Light variant.
//
// `D` is a *live* object — components import it once at module load and
// reference its properties at render time. `applyTheme(mode)` mutates D's
// values in place; the App-level theme state increments alongside, which
// triggers re-renders that pick up the new colors. Avoids a giant
// useContext refactor across every component.

export const DARK = {
  bg: "radial-gradient(circle at 18% 4%, rgba(34,211,238,0.10), transparent 30%), radial-gradient(circle at 82% 0%, rgba(56,189,248,0.06), transparent 32%), linear-gradient(135deg, #06111b 0%, #08131f 42%, #020811 100%)",
  glass: "linear-gradient(180deg, rgba(12,29,45,0.86), rgba(5,17,29,0.78))",
  glassBorder: "1px solid rgba(103,232,249,0.16)",
  cardBg:
    "radial-gradient(circle at 50% 0%, rgba(103,232,249,0.10), transparent 45%), linear-gradient(180deg, rgba(15,38,56,0.85), rgba(4,17,29,0.88))",
  cyan: "#67e8f9",
  cyanD: "#22d3ee",
  ink: "#e5eef7",
  sub: "#91a6b8",
  faint: "#6b7f90",
  ok: "#4ade80",
  warn: "#facc15",
  bad: "#fb7185",
  // Component-level tokens — used directly in JSX so theme swaps propagate
  // without needing CSS attribute-selector overrides.
  borderDefault: "rgba(103,232,249,0.16)",
  borderHover: "rgba(125,249,255,.5)",
  borderSelected: "rgba(125,249,255,.7)",
  shadowCard: "0 12px 36px rgba(0,0,0,.32)",
  shadowHover: "0 18px 60px rgba(34,211,238,.12)",
  shadowSelected: "0 0 0 1px rgba(125,249,255,.25), 0 18px 60px rgba(34,211,238,.18)",
  accentBg: "rgba(34,211,238,.12)",
  accentBorder: "rgba(103,232,249,.28)",
  navActiveBg: "linear-gradient(90deg, rgba(34,211,238,.16), rgba(34,211,238,.04))",
  navActiveText: "#7df9ff",
  navInactive: "#b9c8d6",
  // Solid panel surface for elements browsers won't blend (e.g. <option>).
  panel: "#06111b",
};

export const LIGHT = {
  // Warm cream / taupe palette from the Direction A design.
  // Accent shifts from cool cyan to warm taupe; everything reads softer.
  bg: "radial-gradient(circle at 18% 4%, rgba(156,122,108,0.10), transparent 30%), radial-gradient(circle at 82% 0%, rgba(184,154,142,0.07), transparent 32%), linear-gradient(135deg, #e8e3da 0%, #ece6dc 42%, #e2dccf 100%)",
  glass: "linear-gradient(180deg, rgba(246,241,231,0.92), rgba(239,233,223,0.86))",
  glassBorder: "1px solid rgba(214,207,193,0.85)",
  cardBg: "radial-gradient(circle at 50% 0%, rgba(184,154,142,0.10), transparent 45%), linear-gradient(180deg, rgba(251,246,236,0.95), rgba(244,238,228,0.95))",
  cyan: "#9c7a6c",
  cyanD: "#7d5e51",
  ink: "#2a2620",
  sub: "#6a6258",
  faint: "#9a9285",
  ok: "#6b8a5c",
  warn: "#b88846",
  bad: "#a04d3a",
  // Warm-cream equivalents of the dark-mode component tokens.
  borderDefault: "rgba(184,154,142,.30)",
  borderHover: "rgba(156,122,108,.45)",
  borderSelected: "rgba(156,122,108,.65)",
  shadowCard: "0 4px 16px rgba(70,58,46,.06), 0 1px 3px rgba(70,58,46,.04)",
  shadowHover: "0 8px 24px rgba(156,122,108,.18), 0 1px 3px rgba(70,58,46,.06)",
  shadowSelected: "0 0 0 1px rgba(156,122,108,.30), 0 12px 36px rgba(156,122,108,.20)",
  accentBg: "rgba(184,154,142,.18)",
  accentBorder: "rgba(184,154,142,.50)",
  navActiveBg: "linear-gradient(90deg, rgba(156,122,108,.18), rgba(156,122,108,.04))",
  navActiveText: "#7d5e51",
  navInactive: "#6a6258",
  panel: "#fbf6ec",
};

export const D = { ...DARK };

// Attribute-selector overrides for the most common dark-mode-only inline rgba
// patterns. Components use these everywhere as borders, separators and
// recessed surfaces; in dark mode they're light-on-dark (visible), in light
// mode they'd be invisible-on-white (broken). This stylesheet remaps them to
// the equivalent dark-on-light when the light theme is active.
// Inline-style overrides for light mode. Components import D once and write
// inline rgba(255,255,255,X) / rgba(0,0,0,X) constants directly into style
// props. In light mode many of those become invisible (white-on-white) or
// blinding (cyan glow on white). These attribute selectors remap the most
// common patterns without per-component refactoring.
// Warm-cream override stylesheet for light mode.
// Components write inline rgba(255,255,255,X) / rgba(0,0,0,X) constants
// directly into style props. In light mode those would render
// invisible-on-white or blinding cyan; remap to warm taupe equivalents.
const LIGHT_OVERRIDES_CSS = `
  /* All hardcoded white text → rich brown-black */
  body.theme-light [style*='color: "#fff"'],
  body.theme-light [style*='color:"#fff"'],
  body.theme-light [style*='color: rgb(255, 255, 255)'],
  body.theme-light [style*='color: #fff'],
  body.theme-light [style*='color: white'] {
    color: #2a2620 !important;
  }

  /* Subtle white borders/separators → soft taupe */
  body.theme-light [style*="rgba(255,255,255,.04)"],
  body.theme-light [style*="rgba(255,255,255,.05)"],
  body.theme-light [style*="rgba(255,255,255,.06)"],
  body.theme-light [style*="rgba(255,255,255,.07)"],
  body.theme-light [style*="rgba(255,255,255,.08)"] {
    border-color: rgba(184,154,142,0.22) !important;
  }
  body.theme-light [style*="rgba(255,255,255,.10)"],
  body.theme-light [style*="rgba(255,255,255,.12)"],
  body.theme-light [style*="rgba(255,255,255,.18)"] {
    border-color: rgba(184,154,142,0.42) !important;
  }

  /* Recessed dark surfaces → warm cream */
  body.theme-light [style*="rgba(0,0,0,.10)"],
  body.theme-light [style*="rgba(0,0,0,.16)"],
  body.theme-light [style*="rgba(0,0,0,.18)"],
  body.theme-light [style*="rgba(0,0,0,.20)"],
  body.theme-light [style*="rgba(0,0,0,.22)"],
  body.theme-light [style*="rgba(0,0,0,.24)"] {
    background-color: rgba(70,58,46,0.05) !important;
  }
  body.theme-light [style*="rgba(0,0,0,.30)"] {
    background-color: #fbf6ec !important;
  }

  /* Inputs / selects */
  body.theme-light input,
  body.theme-light select,
  body.theme-light textarea {
    color: #2a2620 !important;
    background-color: #fbf6ec !important;
    border-color: rgba(184,154,142,0.42) !important;
  }
  body.theme-light input::placeholder,
  body.theme-light textarea::placeholder {
    color: #9a9285 !important;
  }

  /* Soften the heavy dark-mode card shadows */
  body.theme-light [style*="0 12px 36px rgba(0,0,0,.32)"],
  body.theme-light [style*="0 16px 46px rgba(0,0,0,.32)"],
  body.theme-light [style*="0 22px 70px rgba(0,0,0,.35)"] {
    box-shadow: 0 4px 16px rgba(70,58,46,.08), 0 1px 3px rgba(70,58,46,.05) !important;
  }

  /* ANY cyan rgba — match BOTH source form (no spaces, .X alpha) AND the
     browser-normalized form (spaces, 0.X alpha). Chrome/Webkit normalize
     inline rgba when serializing the style attribute, so attribute selectors
     using the unspaced form alone miss after first paint. */
  body.theme-light [style*="rgba(125,249,255,"],
  body.theme-light [style*="rgba(125, 249, 255,"] {
    border-color: rgba(156,122,108,.45) !important;
    box-shadow: 0 8px 24px rgba(156,122,108,.14), 0 1px 3px rgba(70,58,46,.05) !important;
  }
  body.theme-light [style*="rgba(125,249,255,"][style*="radial-gradient"],
  body.theme-light [style*="rgba(125, 249, 255,"][style*="radial-gradient"],
  body.theme-light [style*="rgba(103,232,249,"][style*="radial-gradient"],
  body.theme-light [style*="rgba(103, 232, 249,"][style*="radial-gradient"] {
    background: radial-gradient(circle at 50% 40%, rgba(184,154,142,.10), transparent 65%) !important;
  }

  body.theme-light [style*="rgba(34,211,238,"],
  body.theme-light [style*="rgba(34, 211, 238,"] {
    background: rgba(156,122,108,.10) !important;
    box-shadow: 0 8px 24px rgba(156,122,108,.14), 0 1px 3px rgba(70,58,46,.05) !important;
  }

  body.theme-light [style*="rgba(103,232,249,"],
  body.theme-light [style*="rgba(103, 232, 249,"] {
    border-color: rgba(184,154,142,.50) !important;
  }

  /* Hardcoded cyan hex values used in inline styles → warm taupe */
  body.theme-light [style*='color: "#7df9ff"'],
  body.theme-light [style*='color: "#67e8f9"'],
  body.theme-light [style*='color: "#22d3ee"'],
  body.theme-light [style*="color: #7df9ff"],
  body.theme-light [style*="color: #67e8f9"] {
    color: #9c7a6c !important;
  }
  /* Cool icon body color used in InstIcon callers — warm muted on light */
  body.theme-light [style*='color: "#dce7f2"'] {
    color: #6a6258 !important;
  }
  /* Inactive nav-item text color (#b9c8d6 cool blue-gray) → warm gray */
  body.theme-light [style*='color: "#b9c8d6"'],
  body.theme-light [style*='color: rgb(185, 200, 214)'] {
    color: #6a6258 !important;
  }
  /* Other cool sub-tones that leak in dark-mode-only color literals */
  body.theme-light [style*='color: "#cbd7e3"'],
  body.theme-light [style*='color: "#d8e8f4"'] {
    color: #6a6258 !important;
  }

  /* Shimmer animation overlay (white-flash on cyan bar) → warm flash on taupe */
  body.theme-light [style*="linear-gradient(90deg, transparent, rgba(255,255,255,.4)"] {
    background: linear-gradient(90deg, transparent, rgba(70,58,46,.20), transparent) !important;
    background-size: 200% 100% !important;
  }

  /* Dark-mode-only sub-text colors → warm gray equivalents */
  body.theme-light [style*='color: "#91a6b8"'],
  body.theme-light [style*='color:"#91a6b8"'],
  body.theme-light [style*='color: "#c9d6e2"'],
  body.theme-light [style*='color: "#dce7f2"'] {
    color: #6a6258 !important;
  }
  body.theme-light [style*='color: "#6b7f90"'],
  body.theme-light [style*='color: "#9fb1c2"'] {
    color: #9a9285 !important;
  }

  /* Status / activity pills — keep semantic color but adjust for cream bg */
  body.theme-light [style*="rgba(74,222,128,.16)"] {
    background-color: rgba(107,138,92,0.18) !important;
  }
  body.theme-light [style*="rgba(74,222,128,.32)"],
  body.theme-light [style*="rgba(74,222,128,.36)"] {
    border-color: rgba(107,138,92,0.50) !important;
  }
  body.theme-light [style*="rgba(251,113,133,.14)"] {
    background-color: rgba(160,77,58,0.14) !important;
  }
  body.theme-light [style*="rgba(251,113,133,.32)"] {
    border-color: rgba(160,77,58,0.42) !important;
  }
`;

let _styleEl = null;

export function applyTheme(mode) {
  const next = mode === "light" ? LIGHT : DARK;
  for (const k of Object.keys(D)) delete D[k];
  Object.assign(D, next);
  if (typeof document !== "undefined") {
    document.body.style.background = next.bg;
    document.body.style.color = next.ink;
    document.body.classList.toggle("theme-light", mode === "light");
    document.body.classList.toggle("theme-dark", mode !== "light");
    if (!_styleEl) {
      _styleEl = document.createElement("style");
      _styleEl.id = "databased-theme-overrides";
      _styleEl.textContent = LIGHT_OVERRIDES_CSS;
      document.head.appendChild(_styleEl);
    }
  }
}

export const ICON_LABELS = {
  computer: "Computer",
  orbitrap: "LC-HRMS Orbitrap",
  smps: "Aerosol Sizing",
  chamber: "Environmental Chamber",
  gcms: "GC-MS",
  gcfid: "GC-FID",
  uvvis: "UV-Vis",
};

export function healthColor(level) {
  if (level === "good") return D.ok;
  if (level === "warning") return D.warn;
  return D.bad;
}

export function statusColor(online) {
  return online ? D.ok : D.bad;
}

export function logStatusColor(status) {
  if (status === "success") return D.ok;
  if (status === "running") return D.cyan;
  if (status === "warning") return D.warn;
  return D.bad;
}
