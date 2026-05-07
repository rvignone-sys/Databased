export function relativeTime(iso) {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return `${Math.floor(diff)} sec ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

// Compact, design-style: "38s", "2m", "12d 3h"
export function shortRelative(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export function uptime(seconds) {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function storage(gb) {
  if (gb == null) return "—";
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`;
  return `${gb.toFixed(0)}`;
}

// HH:MM:SS for log rows
export function clockTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8);
}

// "0m 38s" for durations between two ISO timestamps
export function duration(startedIso, completedIso) {
  if (!startedIso || !completedIso) return "—";
  const ms = new Date(completedIso) - new Date(startedIso);
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${(s % 60).toString().padStart(2, "0")}s`;
}
