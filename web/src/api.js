// Thin fetch wrapper. Cookies (session) flow with credentials: "include".
const opts = (extra = {}) => ({ credentials: "include", ...extra });

async function jsonOrThrow(res) {
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = body && body.error ? body.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

export const api = {
  health: () => fetch("/api/health", opts()).then(jsonOrThrow),

  me: () => fetch("/api/auth/me", opts()).then(jsonOrThrow),
  login: (username, password, remember = false) =>
    fetch("/api/auth/login", opts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, remember }),
    })).then(jsonOrThrow),
  logout: () => fetch("/api/auth/logout", opts({ method: "POST" })).then(jsonOrThrow),
  updateMe: (patch) =>
    fetch("/api/auth/me", opts({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })).then(jsonOrThrow),

  computers: (status) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return fetch(`/api/computers${qs}`, opts()).then(jsonOrThrow);
  },
  approveComputer: (id) =>
    fetch(`/api/computers/${id}/approve`, opts({ method: "POST" })).then(jsonOrThrow),
  adoptComputer: (existingId, pendingId) =>
    fetch(`/api/computers/${existingId}/adopt`, opts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pending_id: pendingId }),
    })).then(jsonOrThrow),
  updateComputer: (id, patch) =>
    fetch(`/api/computers/${id}`, opts({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })).then(jsonOrThrow),
  metrics: (id) => fetch(`/api/computers/${id}/metrics`, opts()).then(jsonOrThrow),
  hostMetrics: () => fetch(`/api/host/metrics`, opts()).then(jsonOrThrow),
  pushAgentUpdate: (computerId) =>
    fetch(`/api/computers/${computerId}/push-update`, opts({ method: "POST" })).then(jsonOrThrow),
  pushAgentUpdateAll: () =>
    fetch(`/api/computers/push-update-all`, opts({ method: "POST" })).then(jsonOrThrow),
  tunnelStatus: () => fetch(`/api/computers/tunnel-status`, opts()).then(jsonOrThrow),
  tunnelSync: () => fetch(`/api/computers/tunnel-sync`, opts({ method: "POST" })).then(jsonOrThrow),
  rdpUrl: (computerId) => `/api/computers/${computerId}/rdp.rdp`,
  rdpSession: (computerId) =>
    fetch(`/api/computers/${computerId}/rdp-session`, opts({ method: "POST" })).then(jsonOrThrow),
  hostVncSession: () =>
    fetch(`/api/computers/host-vnc-session`, opts({ method: "POST" })).then(jsonOrThrow),

  users: () => fetch("/api/users", opts()).then(jsonOrThrow),
  createUser: (payload) =>
    fetch("/api/users", opts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })).then(jsonOrThrow),
  updateUser: (id, patch) =>
    fetch(`/api/users/${id}`, opts({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })).then(jsonOrThrow),
  deleteUser: (id) =>
    fetch(`/api/users/${id}`, opts({ method: "DELETE" })).then(jsonOrThrow),

  instrumentTypes: () => fetch("/api/instrument-types", opts()).then(jsonOrThrow),
  createInstrumentType: (payload) =>
    fetch("/api/instrument-types", opts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })).then(jsonOrThrow),
  updateInstrumentType: (id, patch) =>
    fetch(`/api/instrument-types/${id}`, opts({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })).then(jsonOrThrow),
  deleteInstrumentType: (id) =>
    fetch(`/api/instrument-types/${id}`, opts({ method: "DELETE" })).then(jsonOrThrow),

  settings: () => fetch("/api/settings", opts()).then(jsonOrThrow),
  updateSettings: (patch) =>
    fetch("/api/settings", opts({
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })).then(jsonOrThrow),
  uploadLogo: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/settings/logo", opts({ method: "POST", body: fd })).then(jsonOrThrow);
  },
  deleteLogo: () => fetch("/api/settings/logo", opts({ method: "DELETE" })).then(jsonOrThrow),
  testNotify: () => fetch("/api/settings/test-notify", opts({ method: "POST" })).then(jsonOrThrow),

  repoInfo: () => fetch("/api/repo/info", opts()).then(jsonOrThrow),
  repoPull: () => fetch("/api/repo/pull", opts({ method: "POST" })).then(jsonOrThrow),

  jobs: () => fetch("/api/jobs", opts()).then(jsonOrThrow),
  createJob: (payload) =>
    fetch("/api/jobs", opts({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })).then(jsonOrThrow),
  updateJob: (id, patch) =>
    fetch(`/api/jobs/${id}`, opts({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })).then(jsonOrThrow),
  deleteJob: (id) =>
    fetch(`/api/jobs/${id}`, opts({ method: "DELETE" })).then(jsonOrThrow),
  triggerJob: (id) =>
    fetch(`/api/jobs/${id}/trigger`, opts({ method: "POST" })).then(jsonOrThrow),
  startCompare: (jobId) =>
    fetch(`/api/jobs/${jobId}/compare`, opts({ method: "POST" })).then(jsonOrThrow),
  getCompare: (compareId) =>
    fetch(`/api/jobs/compares/${compareId}`, opts()).then(jsonOrThrow),

  logs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return fetch(`/api/logs${qs ? "?" + qs : ""}`, opts()).then(jsonOrThrow);
  },
};
