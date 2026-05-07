// Flat instrument icons + UI line-icon set + Spark line.
// Ported from the Direction A · Dark design bundle.

function IconOrbitrap({ size = 64, color = "#fff", accent = "#67e8f9" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="14" width="22" height="36" rx="2" stroke={color} strokeWidth="1.5" />
      <rect x="10" y="20" width="14" height="3" fill={accent} />
      <rect x="10" y="27" width="14" height="3" fill={color} opacity=".4" />
      <rect x="10" y="34" width="14" height="3" fill={color} opacity=".4" />
      <rect x="32" y="14" width="26" height="36" rx="2" stroke={color} strokeWidth="1.5" />
      <circle cx="45" cy="26" r="6" stroke={accent} strokeWidth="1.5" />
      <circle cx="45" cy="26" r="2" fill={accent} />
      <path d="M38 38 L52 38 M38 42 L48 42" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconSmps({ size = 64, color = "#fff", accent = "#67e8f9" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="26" y="6" width="14" height="44" rx="3" stroke={color} strokeWidth="1.5" />
      <rect x="26" y="14" width="14" height="2" fill={accent} />
      <rect x="26" y="20" width="14" height="2" fill={color} opacity=".4" />
      <rect x="20" y="50" width="26" height="6" rx="1" stroke={color} strokeWidth="1.5" />
      <path d="M33 6 L33 2 M28 4 L38 4" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="44" r="6" stroke={color} strokeWidth="1.5" />
      <path d="M10 44 L18 44 M14 40 L14 48" stroke={color} strokeWidth="1.2" />
      <path d="M20 44 L26 44" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}

function IconChamber({ size = 64, color = "#fff", accent = "#67e8f9" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="14" width="52" height="40" rx="3" stroke={color} strokeWidth="2" />
      <rect x="11" y="19" width="42" height="30" rx="2" stroke={color} strokeWidth="1" opacity=".5" />
      <circle cx="22" cy="34" r="6" stroke={accent} strokeWidth="1.5" />
      <circle cx="42" cy="34" r="4" stroke={accent} strokeWidth="1.5" />
      <path d="M22 14 L22 8 M42 14 L42 6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22 8 L26 8 M42 6 L46 6" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconGcms({ size = 64, color = "#fff", accent = "#67e8f9" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="22" width="20" height="28" rx="2" stroke={color} strokeWidth="1.5" />
      <circle cx="16" cy="34" r="4" stroke={accent} strokeWidth="1.5" />
      <rect x="28" y="14" width="20" height="36" rx="2" stroke={color} strokeWidth="1.5" />
      <path d="M32 20 L44 20 M32 26 L40 26 M32 32 L42 32" stroke={color} strokeWidth="1.2" />
      <rect x="50" y="22" width="8" height="28" rx="1" stroke={color} strokeWidth="1.5" />
      <rect x="52" y="26" width="4" height="6" fill={accent} />
    </svg>
  );
}

function IconGcfid({ size = 64, color = "#fff", accent = "#67e8f9" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="22" width="18" height="28" rx="2" stroke={color} strokeWidth="1.5" />
      <path d="M15 36 C 12 32, 18 30, 15 26" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M15 26 L13 22 M15 26 L17 22" stroke={accent} strokeWidth="1.5" strokeLinecap="round" />
      <rect x="26" y="14" width="22" height="36" rx="2" stroke={color} strokeWidth="1.5" />
      <path d="M30 22 L44 22 M30 28 L42 28 M30 34 L44 34" stroke={color} strokeWidth="1.2" />
      <rect x="50" y="22" width="8" height="28" rx="1" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function IconUvvis({ size = 64, color = "#fff", accent = "#67e8f9" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="20" width="52" height="28" rx="3" stroke={color} strokeWidth="1.5" />
      <rect x="22" y="26" width="20" height="14" rx="1" stroke={color} strokeWidth="1.2" />
      <path d="M24 36 C 27 30, 29 38, 32 32 S 38 32, 40 35" stroke={accent} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="14" cy="34" r="3" stroke={color} strokeWidth="1.5" />
      <circle cx="50" cy="34" r="3" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}


function IconComputer({ size = 64, color = "#fff", accent = "#67e8f9" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* Monitor */}
      <rect x="8" y="12" width="48" height="32" rx="2" stroke={color} strokeWidth="1.5" />
      <rect x="11" y="15" width="42" height="26" fill={accent} opacity=".15" />
      {/* Screen content — abstract bars */}
      <rect x="14" y="18" width="14" height="2" fill={accent} opacity=".7" />
      <rect x="14" y="22" width="22" height="2" fill={color} opacity=".4" />
      <rect x="14" y="26" width="18" height="2" fill={color} opacity=".4" />
      <rect x="14" y="32" width="36" height="6" fill={accent} opacity=".25" />
      {/* Stand */}
      <path d="M26 44 L24 50 L40 50 L38 44" stroke={color} strokeWidth="1.5" fill="none" />
      <rect x="20" y="50" width="24" height="2" rx="1" fill={color} opacity=".6" />
    </svg>
  );
}

const ICON_MAP = {
  computer: IconComputer,
  orbitrap: IconOrbitrap,
  smps: IconSmps,
  chamber: IconChamber,
  gcms: IconGcms,
  gcfid: IconGcfid,
  uvvis: IconUvvis,
};

// Public — UIs that let admins pick an icon should iterate this so the
// list stays in sync with whatever SVGs we actually ship.
export const AVAILABLE_ICON_KEYS = Object.keys(ICON_MAP);

// All ~1500 Lucide icons exposed via dynamic imports. Vite code-splits
// each icon into its own chunk — only the icons users actually pick
// download to the browser. Initial bundle stays small.
import { lazy, Suspense } from "react";
import dynamicIconImports from "lucide-react/dynamicIconImports";

// Sorted list of all available kebab-case icon names — populates the picker.
export const LUCIDE_NAMES = Object.keys(dynamicIconImports).sort();

// Curated category presets for the picker — quick-filter chips so users
// don't have to scroll 1964 icons. "All" is implicit (no chip = full list).
// Names that don't exist in dynamicIconImports are silently dropped.
export const LUCIDE_CATEGORIES = {
  "Lab / Science": [
    "atom", "beaker", "flask-conical", "flask-round", "flask-conical-off",
    "microscope", "telescope", "test-tube", "test-tubes", "test-tube-diagonal",
    "dna", "dna-off", "syringe", "pill", "pill-bottle", "tablets", "capsules",
    "thermometer", "thermometer-sun", "thermometer-snowflake",
    "droplet", "droplets", "biohazard", "radiation", "magnet", "magnet-off",
    "lightbulb", "lightbulb-off", "stethoscope", "bandage", "heart-pulse",
    "brain", "brain-circuit", "brain-cog", "ear", "eye", "bone",
    "leaf", "leafy-green", "sprout", "tree-pine", "trees", "tree-deciduous",
    "bird", "bug", "fish", "rabbit", "snail",
  ],
  "Computer / IT": [
    "monitor", "monitor-smartphone", "laptop", "laptop-minimal", "tv",
    "server", "server-cog", "server-crash", "database", "database-zap",
    "hard-drive", "hard-drive-download", "hard-drive-upload",
    "cpu", "memory-stick", "ram", "router", "network",
    "wifi", "wifi-off", "bluetooth", "bluetooth-connected", "ethernet-port",
    "usb", "mouse", "mouse-pointer", "keyboard", "printer",
    "headphones", "speaker", "smartphone", "tablet", "smartwatch",
    "terminal", "terminal-square", "code", "code-2", "code-xml",
    "github", "git-branch", "git-commit", "git-merge", "git-pull-request",
    "cloud", "cloud-cog", "cloud-upload", "cloud-download",
  ],
  "Sensors / Measurement": [
    "gauge", "gauge-circle", "ruler", "scale", "weight", "calculator",
    "signal", "signal-high", "signal-low", "signal-zero",
    "radio", "radio-tower", "radio-receiver",
    "activity", "activity-square", "trending-up", "trending-down",
    "compass", "satellite", "satellite-dish",
    "camera", "camera-off", "video", "video-off", "scan", "scan-line",
    "mic", "mic-off", "volume-2", "wave-sine",
    "battery", "battery-charging", "battery-full", "battery-low",
    "zap", "zap-off", "plug", "plug-2", "plug-zap",
  ],
  "Environment / Weather": [
    "sun", "sunrise", "sunset", "moon", "moon-star", "star", "stars",
    "cloud-rain", "cloud-snow", "cloud-lightning", "cloud-fog", "cloud-drizzle",
    "snowflake", "wind", "tornado", "umbrella",
    "leaf", "tree-pine", "tree-deciduous", "trees", "mountain", "mountain-snow",
    "flame", "waves", "droplets", "rainbow",
    "earth", "globe", "compass", "map", "map-pin",
    "thermometer", "thermometer-sun", "thermometer-snowflake",
  ],
  "Buildings / Places": [
    "building", "building-2", "house", "home", "warehouse", "factory",
    "hospital", "school", "store", "library", "church", "castle", "tent",
    "hotel", "landmark",
    "door-open", "door-closed",
    "map", "map-pin", "navigation", "navigation-2",
  ],
  "Vehicles / Transport": [
    "car", "car-front", "truck", "bus", "ambulance", "fire-extinguisher",
    "plane", "plane-takeoff", "plane-landing",
    "train", "train-track", "tram-front",
    "ship", "sailboat", "anchor",
    "bike", "scooter", "skateboard", "footprints",
    "fuel", "package", "package-2",
  ],
  "Food / Bio": [
    "apple", "banana", "cherry", "carrot", "citrus", "egg", "fish",
    "ham", "pizza", "salad", "sandwich", "soup", "wheat",
    "coffee", "wine", "beer", "milk",
  ],
  "Tools / Misc": [
    "wrench", "hammer", "cog", "settings", "settings-2",
    "key", "key-round", "lock", "unlock", "shield", "shield-check",
    "package", "box", "boxes", "archive",
    "paint-bucket", "palette", "scissors", "saw",
    "rocket", "anchor", "compass",
    "puzzle", "lego",
  ],
  "Symbols / Status": [
    "check", "check-circle", "x", "x-circle", "circle", "square",
    "alert-triangle", "alert-circle", "alert-octagon", "info",
    "plus", "minus", "ban",
    "thumbs-up", "thumbs-down",
    "star", "heart", "flag", "bookmark",
    "eye", "eye-off",
    "loader", "refresh-cw", "rotate-ccw", "play", "pause",
  ],
};

// Cache lazy-loaded icon components by name so we don't re-call lazy()
// on every render (which would tear down/remount + re-fetch the chunk).
const _lucideCache = new Map();
function _getLazyLucide(name) {
  if (!_lucideCache.has(name)) {
    _lucideCache.set(name, lazy(dynamicIconImports[name]));
  }
  return _lucideCache.get(name);
}

function LucideDynamic({ name, size = 16, color = "currentColor" }) {
  if (!dynamicIconImports[name]) return null;
  const Icon = _getLazyLucide(name);
  return (
    <Suspense fallback={<span style={{ display: "inline-block", width: size, height: size }} />}>
      <Icon size={size} color={color} strokeWidth={1.5} />
    </Suspense>
  );
}

/**
 * Render an instrument's icon. Resolution priority:
 *   1. `customSvg` prop                    → admin-supplied raw SVG markup
 *   2. `lucideName` prop                   → kebab-case key into LUCIDE_LIBRARY
 *   3. context lookup by `type` (if provider mounted) for above two
 *   4. `type` prop                         → built-in glyph from ICON_MAP
 *   5. fallback                            → generic Computer glyph
 */
import { useInstrumentTypes } from "./typesContext";
export function InstIcon({ type, customSvg, lucideName, size = 64, color = "#dce7f2", accent = "#67e8f9" }) {
  const { byKey } = useInstrumentTypes();
  // Pull defaults from the context if caller didn't pass explicit overrides.
  const dbRow = type ? byKey[type] : null;
  const effectiveSvg = customSvg ?? (dbRow?.svg || null);
  const effectiveLucide = lucideName ?? (dbRow?.lucide_name || null);

  if (effectiveSvg) {
    return (
      <span
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, color }}
        dangerouslySetInnerHTML={{ __html: effectiveSvg }}
      />
    );
  }
  if (effectiveLucide && dynamicIconImports[effectiveLucide]) {
    return <LucideDynamic name={effectiveLucide} size={size} color={color} />;
  }
  const Component = ICON_MAP[type] ?? IconComputer;
  return <Component size={size} color={color} accent={accent} />;
}

const UI_PATHS = {
  home: "M3 11 L10 4 L17 11 M5 9 L5 17 L15 17 L15 9",
  instr: "M5 3 L5 17 L15 17 L15 3 Z M8 3 L8 7 L12 7 L12 3",
  sync: "M14 4 L17 4 L17 7 M3 16 L3 13 L6 13 M17 4 C 14 1, 5 2, 4 9 M3 16 C 6 19, 15 18, 16 11",
  logs: "M5 3 L13 3 L15 5 L15 17 L5 17 Z M7 8 L13 8 M7 11 L13 11 M7 14 L11 14",
  alert: "M10 3 L18 16 L2 16 Z M10 8 L10 12 M10 14 L10 14.1",
  settings: "M8 2 L12 2 L12.7 4.5 L15 5.5 L17 4.3 L19 8 L17 10 L17 13 L19 14 L17 17.7 L15 16.5 L12.7 17.5 L12 20 L8 20 L7.3 17.5 L5 16.5 L3 17.7 L1 14 L3 13 L3 10 L1 8 L3 4.3 L5 5.5 L7.3 4.5 Z M10 8 A 2 2 0 1 0 10 12 A 2 2 0 1 0 10 8",
  plus: "M10 4 L10 16 M4 10 L16 10",
  search: "M9 4 A 5 5 0 1 0 9 14 A 5 5 0 1 0 9 4 M13 13 L17 17",
  bell: "M5 14 L15 14 M5 14 C 5 8, 5 4, 10 4 C 15 4, 15 8, 15 14 M8 14 C 8 16, 12 16, 12 14",
  user: "M10 9 A 3 3 0 1 0 10 3 A 3 3 0 1 0 10 9 M3 17 C 3 13, 17 13, 17 17",
  chevron: "M7 7 L10 10 L13 7",
  play: "M5 4 L15 10 L5 16 Z",
  pause: "M6 4 L9 4 L9 16 L6 16 Z M11 4 L14 4 L14 16 L11 16 Z",
  refresh: "M14 4 L17 4 L17 7 M17 4 C 14 1, 5 2, 4 9 M3 16 L3 13 L6 13 M3 16 C 6 19, 15 18, 16 11",
  folder: "M3 5 L8 5 L10 7 L17 7 L17 16 L3 16 Z",
  server: "M3 4 L17 4 L17 9 L3 9 Z M3 11 L17 11 L17 16 L3 16 Z M6 6.5 L6 6.6 M6 13.5 L6 13.6",
  check: "M4 10 L8 14 L16 6",
  x: "M5 5 L15 15 M15 5 L5 15",
  download: "M10 3 L10 13 M5 9 L10 14 L15 9 M3 17 L17 17",
  filter: "M3 4 L17 4 L12 11 L12 17 L8 15 L8 11 Z",
  calendar: "M3 5 L17 5 L17 17 L3 17 Z M3 9 L17 9 M7 3 L7 7 M13 3 L13 7",
  edit: "M3 17 L7 17 L17 7 L13 3 L3 13 Z M11 5 L15 9",
  trash: "M4 6 L16 6 M7 6 L7 3 L13 3 L13 6 M5 6 L6 17 L14 17 L15 6",
  grid: "M3 3 L9 3 L9 9 L3 9 Z M11 3 L17 3 L17 9 L11 9 Z M3 11 L9 11 L9 17 L3 17 Z M11 11 L17 11 L17 17 L11 17 Z",
  list: "M3 5 L17 5 M3 10 L17 10 M3 15 L17 15",
  sun: "M10 2 L10 4 M10 16 L10 18 M2 10 L4 10 M16 10 L18 10 M4 4 L5.5 5.5 M14.5 14.5 L16 16 M4 16 L5.5 14.5 M14.5 5.5 L16 4 M10 6 A 4 4 0 1 0 10 14 A 4 4 0 1 0 10 6",
  moon: "M16 12 A 6 6 0 1 1 8 4 A 5 5 0 0 0 16 12",
  // Wifi-tower style for the per-PC internet tunnel toggle.
  wifi: "M2 7 A 12 12 0 0 1 18 7 M4.5 10 A 9 9 0 0 1 15.5 10 M7 13 A 5 5 0 0 1 13 13 M10 16 L10 16.1",
};

export function UI({ name, size = 16 }) {
  const d = UI_PATHS[name] ?? UI_PATHS.home;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      <path d={d} />
    </svg>
  );
}

export function Spark({ values, w = 80, h = 24, stroke = "#67e8f9", sw = 1.5, responsive = false }) {
  const data = values && values.length ? values : [0, 0];
  const max = Math.max(...data, 0.01);
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 2 - (v / max) * (h - 4)]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    d += ` Q ${cx} ${py} ${x} ${y}`;
  }
  // responsive=true → fills its container width; preserveAspectRatio="none"
  // lets the path stretch horizontally without changing line thickness much
  // (height stays fixed).
  const svgProps = responsive
    ? { width: "100%", height: h, viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none", style: { display: "block" } }
    : { width: w, height: h };
  return (
    <svg {...svgProps}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Placeholder activity sparkline data per icon type — no backend yet.
export const SPARKS = {
  orbitrap: [.2, .3, .4, .3, .5, .6, .4, .3, .2, .4, .6, .7, .5, .6, .7, .8, .6, .5, .7, .8, .9, .7, .8, .6],
  smps: [.4, .5, .4, .5, .6, .5, .4, .5, .6, .7, .6, .5, .6, .7, .6, .5, .6, .7, .6, .5, .6, .7, .6, .5],
  chamber: [.6, .7, .8, .7, .8, .9, .8, .7, .8, .9, .8, .7, .6, .7, .8, .9, .85, .8, .9, .85, .9, .8, .85, .85],
  gcms: [.3, .4, .5, .4, .5, .6, .5, .6, .7, .6, .5, .6, .7, .6, .7, .6, .7, .8, .7, .8, .7, .6, .7, .71],
  gcfid: [.5, .4, .5, .6, .5, .6, .5, .6, .7, .6, .7, .6, .5, .6, .7, .6, .5, .6, .7, .6, .7, .6, .7, .68],
  uvvis: [.4, .5, .4, .3, .4, .3, .2, .3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  inficon: [.5, .6, .5, .6, .7, .6, .5, .6, .7, .6, .5, .6, .7, .6, .5, .6, .7, .6, .7, .6, .7, .6, .7, .66],
};
