import { useEffect, useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { UI } from "./icons";

const inputStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,.10)",
  background: "rgba(0,0,0,.30)",
  color: "#fff",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
};

export default function UsersSection() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" });
  const [editing, setEditing] = useState(null); // {id, password}

  async function refresh() {
    try { setUsers(await api.users()); setError(""); }
    catch (err) { setError(err.message); }
  }

  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!newUser.username || !newUser.password) {
      setError("username and password required");
      return;
    }
    try {
      await api.createUser(newUser);
      setNewUser({ username: "", password: "", role: "user" });
      setShowNew(false);
      await refresh();
    } catch (err) { setError(err.message); }
  }

  async function changeRole(u, newRole) {
    try { await api.updateUser(u.id, { role: newRole }); await refresh(); }
    catch (err) { setError(err.message); }
  }
  async function resetPassword(u) {
    try { await api.updateUser(u.id, { password: editing.password }); setEditing(null); await refresh(); }
    catch (err) { setError(err.message); }
  }
  async function remove(u) {
    if (!window.confirm(`Delete user "${u.username}"? They lose dashboard + RDP access.`)) return;
    try { await api.deleteUser(u.id); await refresh(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>Users</h2>
        <button
          onClick={() => setShowNew((v) => !v)}
          style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(103,232,249,.32)", background: "rgba(34,211,238,.10)", color: D.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <UI name="plus" size={12} /> {showNew ? "Cancel" : "New user"}
        </button>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: D.sub }}>
        <strong style={{ color: D.cyan }}>admin</strong> = full control · <strong style={{ color: D.cyan }}>user</strong> = view + RDP only.
        Each user's dashboard credentials are also their Windows username — make sure the same account exists on every lab PC.
      </p>

      {error ? (
        <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: "rgba(244,63,94,.10)", border: "1px solid rgba(244,63,94,.18)", color: D.bad, fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      {showNew ? (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "rgba(0,0,0,.18)", border: "1px solid rgba(255,255,255,.06)", display: "grid", gridTemplateColumns: "1fr 1fr 110px 90px", gap: 8, alignItems: "center" }}>
          <input placeholder="username (matches Windows account)" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} style={inputStyle} />
          <input type="password" placeholder="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} style={inputStyle} />
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} style={{ ...inputStyle, fontFamily: "Geist" }}>
            <option value="user" style={{ background: D.panel }}>user</option>
            <option value="admin" style={{ background: D.panel }}>admin</option>
          </select>
          <button onClick={create} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})`, color: "#052432", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Create
          </button>
        </div>
      ) : null}

      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 80px", gap: 10, padding: "10px 14px", background: "rgba(0,0,0,.18)", fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>
          <span>Username</span><span>Role</span><span>Created</span><span style={{ textAlign: "right" }}>Actions</span>
        </div>
        {users.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: D.sub, fontSize: 12 }}>No users yet.</div>
        ) : users.map((u) => (
          <div key={u.id}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 90px 80px", gap: 10, padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.05)", alignItems: "center", fontSize: 12 }}>
              <span style={{ color: "#fff", fontWeight: 700 }}>{u.username}</span>
              <select value={u.role} onChange={(e) => changeRole(u, e.target.value)} style={{ ...inputStyle, padding: "4px 8px", fontSize: 11, fontFamily: "Geist" }}>
                <option value="user" style={{ background: D.panel }}>user</option>
                <option value="admin" style={{ background: D.panel }}>admin</option>
              </select>
              <span style={{ color: D.faint, fontFamily: "Geist Mono", fontSize: 10 }}>{u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : "—"}</span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                <button
                  onClick={() => setEditing(editing?.id === u.id ? null : { id: u.id, password: "" })}
                  title="Reset password"
                  style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: editing?.id === u.id ? D.cyan : D.ink, cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <UI name="edit" size={11} />
                </button>
                <button
                  onClick={() => remove(u)}
                  title="Delete"
                  style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.bad, cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <UI name="trash" size={11} />
                </button>
              </div>
            </div>
            {editing?.id === u.id ? (
              <div style={{ padding: "0 14px 12px", borderTop: "none", display: "flex", gap: 8, alignItems: "center", background: "rgba(0,0,0,.10)" }}>
                <input
                  type="password"
                  autoFocus
                  placeholder="new password"
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && editing.password && resetPassword(u)}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => resetPassword(u)}
                  disabled={!editing.password}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: editing.password ? `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})` : "rgba(255,255,255,.06)", color: editing.password ? "#052432" : D.faint, fontSize: 12, fontWeight: 700, cursor: editing.password ? "pointer" : "default" }}
                >
                  Set password
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
