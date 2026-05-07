import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Shell } from "./components/Shell";
import Login from "./Login";
import Dashboard from "./Dashboard";
import SyncJobs from "./SyncJobs";
import Logs from "./Logs";
import Settings from "./Settings";
import { D, applyTheme } from "./theme";
import { InstrumentTypesProvider } from "./typesContext";

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState("dashboard");
  const [counts, setCounts] = useState({ pending: 0, jobs: 0 });
  const [systemStats, setSystemStats] = useState(null);
  // Theme state — bumped (and applyTheme'd) whenever the user toggles. The
  // bump triggers re-renders down the tree so components re-read D.
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem("databased.theme") || "dark");
  const [, bumpRender] = useState(0);
  useEffect(() => {
    applyTheme(themeMode);
    bumpRender((n) => n + 1);
    localStorage.setItem("databased.theme", themeMode);
  }, [themeMode]);

  function toggleTheme() {
    const next = themeMode === "dark" ? "light" : "dark";
    setThemeMode(next);
    if (user) api.updateMe({ theme: next }).catch(() => {/* not fatal */});
  }

  useEffect(() => {
    api.me()
      .then((r) => {
        if (r.authenticated) {
          setUser({ id: r.id, username: r.username, role: r.role });
          if (r.theme && r.theme !== themeMode) setThemeMode(r.theme);
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = user?.role === "admin";

  // Sidebar badges — refreshed alongside the views.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    async function tick() {
      try {
        const [c, j] = await Promise.all([api.computers(), api.jobs()]);
        if (!alive) return;
        const approved = c.filter((x) => x.status === "approved");
        const online = approved.filter((x) => x.is_online).length;
        const pendingApproval = c.filter((x) => x.status === "pending").length;
        const enabled = j.filter((x) => x.enabled).length;
        setCounts({ pending: pendingApproval, jobs: j.length });
        setSystemStats({
          approved: approved.length,
          online,
          pending: pendingApproval,
          jobsEnabled: enabled,
          jobsTotal: j.length,
          attention: pendingApproval > 0 || online < approved.length,
        });
      } catch {/* ignore */}
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [user]);

  const badges = useMemo(
    () => ({
      pending: counts.pending || undefined,
      jobs: counts.jobs || undefined,
    }),
    [counts],
  );

  async function logout() {
    try { await api.logout(); } finally { setUser(null); setView("dashboard"); }
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", background: "#06111b", color: D.cyan, display: "grid", placeItems: "center", fontFamily: "Geist, system-ui" }}>
        Loading…
      </div>
    );
  }

  if (!user) return <Login onAuthed={(me) => { setUser(me); if (me.theme) setThemeMode(me.theme); }} />;

  return (
    <InstrumentTypesProvider>
      <Shell
        view={view}
        setView={setView}
        badges={badges}
        user={user}
        onLogout={logout}
        onRefresh={null}
        systemStats={systemStats}
        isAdmin={isAdmin}
        themeMode={themeMode}
        onToggleTheme={toggleTheme}
      >
        {view === "dashboard" ? <Dashboard user={user} onLogout={logout} isAdmin={isAdmin} /> : null}
        {view === "jobs" ? <SyncJobs isAdmin={isAdmin} /> : null}
        {view === "logs" ? <Logs /> : null}
        {view === "settings" && isAdmin ? <Settings /> : null}
        {view === "settings" && !isAdmin ? (
          <div style={{ padding: 32, color: "#91a6b8" }}>Settings are admin-only.</div>
        ) : null}
      </Shell>
    </InstrumentTypesProvider>
  );
}
