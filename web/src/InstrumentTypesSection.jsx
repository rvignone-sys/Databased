import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { D } from "./theme";
import { InstIcon, UI, AVAILABLE_ICON_KEYS, LUCIDE_NAMES, LUCIDE_CATEGORIES } from "./icons";
import { useInstrumentTypes } from "./typesContext";


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


function IconSourceTabs({ value, onChange }) {
  const tabs = [
    { v: "builtin", label: "Built-in" },
    { v: "lucide",  label: "Lucide library" },
    { v: "custom",  label: "Custom SVG" },
  ];
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
      {tabs.map((t) => (
        <button
          key={t.v}
          type="button"
          onClick={() => onChange(t.v)}
          style={{
            padding: "5px 12px",
            borderRadius: 7,
            border: `1px solid ${value === t.v ? D.accentBorder : "rgba(255,255,255,.10)"}`,
            background: value === t.v ? D.accentBg : "transparent",
            color: value === t.v ? D.cyan : D.ink,
            fontSize: 11,
            fontWeight: value === t.v ? 700 : 500,
            cursor: "pointer",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}


// Cap how many icons render at once. Each icon is a lazy-loaded chunk —
// rendering 2000 would issue 2000 HTTP requests on first scroll. Show
// alphabetical first PAGE_LIMIT until user filters with the search box
// or picks a category.
const PAGE_LIMIT = 120;

function LucidePicker({ value, onChange, query, setQuery }) {
  // null category = "All" (full library). Otherwise category name → curated subset.
  const [category, setCategory] = useState(null);
  const validNamesSet = useMemo(() => new Set(LUCIDE_NAMES), []);

  // Source list — full library or the category subset (after filtering out
  // any names that don't actually exist in this lucide-react version).
  const source = useMemo(() => {
    if (!category) return LUCIDE_NAMES;
    return (LUCIDE_CATEGORIES[category] || []).filter((n) => validNamesSet.has(n));
  }, [category, validNamesSet]);

  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return source;
    return source.filter((n) => n.includes(q));
  }, [query, source]);

  // Always keep the currently-selected icon visible even if outside the page.
  const visible = useMemo(() => {
    const limited = filtered.slice(0, PAGE_LIMIT);
    if (value && filtered.includes(value) && !limited.includes(value)) {
      return [value, ...limited];
    }
    return limited;
  }, [filtered, value]);
  const truncated = filtered.length > visible.length;

  return (
    <div>
      {/* Category chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {[null, ...Object.keys(LUCIDE_CATEGORIES)].map((cat) => {
          const active = category === cat;
          const label = cat || "All";
          return (
            <button
              key={label}
              type="button"
              onClick={() => setCategory(cat)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: `1px solid ${active ? D.accentBorder : "rgba(255,255,255,.10)"}`,
                background: active ? D.accentBg : "transparent",
                color: active ? D.cyan : D.sub,
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          placeholder={category ? `Search within ${category} …` : "Search all Lucide icons (atom, beaker, dna, monitor, …)"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <span style={{ fontSize: 10, color: D.faint, fontFamily: "Geist Mono", whiteSpace: "nowrap" }}>
          {filtered.length} of {source.length}
        </span>
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 4, padding: 4, borderRadius: 8, background: "rgba(0,0,0,.18)", border: "1px solid rgba(255,255,255,.06)" }}>
        {visible.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", padding: 16, textAlign: "center", color: D.faint, fontSize: 11 }}>
            No icons match — try a different search term.
          </div>
        ) : visible.map((name) => {
          const active = value === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              title={name}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 8px", borderRadius: 6,
                border: `1px solid ${active ? D.accentBorder : "transparent"}`,
                background: active ? D.accentBg : "transparent",
                color: active ? D.cyan : D.ink,
                fontFamily: "Geist Mono", fontSize: 9,
                cursor: "pointer",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              <InstIcon lucideName={name} size={16} color={active ? D.cyan : D.sub} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
            </button>
          );
        })}
      </div>
      {truncated ? (
        <div style={{ fontSize: 10, color: D.faint, marginTop: 6, textAlign: "center" }}>
          Showing first {PAGE_LIMIT} alphabetically — pick a category or type to filter the other {filtered.length - visible.length}.
        </div>
      ) : null}
    </div>
  );
}


function CustomSvgPicker({ value, onChange }) {
  return (
    <div>
      <textarea
        placeholder='Paste raw SVG markup here, e.g. <svg viewBox="0 0 24 24" ...>...</svg>'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        style={{
          ...inputStyle,
          width: "100%",
          fontFamily: "Geist Mono",
          fontSize: 11,
          padding: "8px 10px",
          resize: "vertical",
          minHeight: 80,
        }}
      />
      <div style={{ fontSize: 10, color: D.faint, marginTop: 6, lineHeight: 1.5 }}>
        Server strips <code style={{ color: D.cyan }}>&lt;script&gt;</code>, <code style={{ color: D.cyan }}>on*=</code> handlers, foreignObject, iframe, embed, and javascript:/vbscript: URLs before saving. Keep paths simple and use <code style={{ color: D.cyan }}>currentColor</code> on strokes/fills so theme colors apply.
      </div>
    </div>
  );
}


/**
 * Single form used for both creating new instrument types and editing
 * existing ones. Pass `initial` (existing row values) + `onSave` (handles
 * the create/patch). When `keyEditable` is false, the key field is
 * read-only (existing rows can't be renamed since Computer.icon_type
 * stores by key).
 */
function TypeForm({ initial, onSave, onCancel, keyEditable, submitLabel }) {
  const [draft, setDraft] = useState({
    key: initial?.key || "",
    label: initial?.label || "",
    lucide_name: initial?.lucide_name || "",
    svg: initial?.svg || "",
  });
  // Detect the active icon source from the initial values.
  const initialSource = (() => {
    if (initial?.svg) return "custom";
    if (initial?.lucide_name) return "lucide";
    return "builtin";
  })();
  const [source, setSource] = useState(initialSource);
  const [lucideQuery, setLucideQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const previewProps = (() => {
    if (source === "custom" && draft.svg) return { customSvg: draft.svg };
    if (source === "lucide" && draft.lucide_name) return { lucideName: draft.lucide_name };
    return { type: draft.key };
  })();

  async function submit() {
    const key = draft.key.trim().toLowerCase();
    const label = draft.label.trim();
    if (!key || !label) { setErr("key and label required"); return; }
    setBusy(true); setErr("");
    try {
      // Patch shape depends on which source the user picked. Empty strings
      // explicitly clear the previous override so switching tabs has the
      // expected effect (e.g. switch from Lucide back to Built-in).
      const payload = { key, label };
      if (source === "lucide") { payload.lucide_name = draft.lucide_name || ""; payload.svg = ""; }
      else if (source === "custom") { payload.svg = draft.svg || ""; payload.lucide_name = ""; }
      else { payload.lucide_name = ""; payload.svg = ""; }
      await onSave(payload);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: "rgba(0,0,0,.18)", border: "1px solid rgba(255,255,255,.06)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "32px 150px 1fr 90px", gap: 8, alignItems: "center" }}>
        <span style={{ display: "grid", placeItems: "center", color: D.sub, width: 32, height: 32, borderRadius: 6, background: "rgba(255,255,255,.04)" }}>
          <InstIcon size={22} color={D.sub} accent={D.cyan} {...previewProps} />
        </span>
        <input
          placeholder="key (e.g. ftir)"
          value={draft.key}
          onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          readOnly={!keyEditable}
          title={keyEditable ? "" : "Keys can't be renamed (Computer.icon_type stores by value). Delete + recreate to change a key."}
          style={{ ...inputStyle, fontFamily: "Geist Mono", fontSize: 12, opacity: keyEditable ? 1 : 0.6, cursor: keyEditable ? "text" : "not-allowed" }}
        />
        <input
          placeholder="Display label"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={inputStyle}
        />
        <button
          onClick={submit}
          disabled={busy}
          style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: `linear-gradient(180deg, ${D.cyan}, ${D.cyanD})`, color: "#052432", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer" }}
        >
          {busy ? "…" : (submitLabel || "Save")}
        </button>
      </div>

      {err ? <div style={{ marginTop: 8, fontSize: 11, color: D.bad, fontFamily: "Geist Mono" }}>{err}</div> : null}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
          Icon source
        </div>
        <IconSourceTabs value={source} onChange={setSource} />

        {source === "builtin" ? (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {AVAILABLE_ICON_KEYS.map((k) => {
                const active = draft.key === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => keyEditable
                      ? setDraft({ ...draft, key: k, lucide_name: "", svg: "" })
                      : setDraft({ ...draft, lucide_name: "", svg: "" })}
                    title={keyEditable
                      ? `Use the "${k}" built-in icon (also fills the key)`
                      : `Built-in source — uses whichever icon matches the existing key (${draft.key})`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 8px", borderRadius: 7,
                      border: `1px solid ${active ? D.accentBorder : "rgba(255,255,255,.10)"}`,
                      background: active ? D.accentBg : "transparent",
                      color: active ? D.cyan : D.ink,
                      fontFamily: "Geist Mono", fontSize: 10,
                      cursor: "pointer",
                    }}
                  >
                    <InstIcon type={k} size={16} color={active ? D.cyan : D.sub} accent={D.cyan} />
                    {k}
                  </button>
                );
              })}
            </div>
            {keyEditable ? (
              <div style={{ fontSize: 10, color: D.faint, marginTop: 6 }}>
                Custom keys not in this list render as the generic Computer icon. Use Lucide or Custom SVG for anything else.
              </div>
            ) : (
              <div style={{ fontSize: 10, color: D.faint, marginTop: 6 }}>
                Built-in mode renders <code style={{ color: D.cyan }}>{draft.key}</code> from icons.jsx. Switch to Lucide or Custom SVG for a different look.
              </div>
            )}
          </div>
        ) : null}

        {source === "lucide" ? (
          <LucidePicker
            value={draft.lucide_name}
            onChange={(name) => setDraft({ ...draft, lucide_name: name, svg: "" })}
            query={lucideQuery}
            setQuery={setLucideQuery}
          />
        ) : null}

        {source === "custom" ? (
          <CustomSvgPicker
            value={draft.svg}
            onChange={(svg) => setDraft({ ...draft, svg, lucide_name: "" })}
          />
        ) : null}
      </div>

      <div style={{ marginTop: 10, textAlign: "right" }}>
        <button
          onClick={onCancel}
          style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: D.sub, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}


export default function InstrumentTypesSection() {
  const [types, setTypes] = useState([]);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const ctxRefresh = useInstrumentTypes().refresh;

  async function refresh() {
    try { setTypes(await api.instrumentTypes()); setError(""); ctxRefresh(); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function create(payload) {
    await api.createInstrumentType(payload);
    setShowNew(false);
    await refresh();
  }

  async function update(id, payload) {
    // PATCH endpoint doesn't allow renaming `key`, so don't send it.
    const { key, ...rest } = payload;
    await api.updateInstrumentType(id, rest);
    setEditingId(null);
    await refresh();
  }

  async function remove(t) {
    if (!window.confirm(`Delete instrument type "${t.label}" (${t.key})?`)) return;
    try { await api.deleteInstrumentType(t.id); await refresh(); }
    catch (err) { setError(err.message); }
  }

  return (
    <div style={{ background: D.glass, border: D.glassBorder, borderRadius: 16, padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#fff" }}>Instrument Types</h2>
        <button
          onClick={() => { setShowNew((v) => !v); setEditingId(null); }}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${D.accentBorder}`, background: D.accentBg, color: D.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <UI name="plus" size={12} /> {showNew ? "Cancel" : "New type"}
        </button>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: D.sub }}>
        Master list shown in instrument dropdowns. Pick from Built-in, the Lucide library, or paste a custom SVG.
      </p>

      {error ? (
        <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: "rgba(244,63,94,.10)", border: "1px solid rgba(244,63,94,.18)", color: D.bad, fontSize: 12 }}>
          {error}
        </div>
      ) : null}

      {showNew ? (
        <TypeForm
          initial={null}
          keyEditable
          submitLabel="Create"
          onSave={create}
          onCancel={() => setShowNew(false)}
        />
      ) : null}

      <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,.06)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "30px 110px 1fr 70px", gap: 10, padding: "10px 14px", background: "rgba(0,0,0,.18)", fontSize: 9, color: D.faint, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 700 }}>
          <span></span><span>Key</span><span>Label</span><span style={{ textAlign: "right" }}>Actions</span>
        </div>
        {types.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: D.sub, fontSize: 12 }}>No instrument types yet.</div>
        ) : types.map((t) => (
          editingId === t.id ? (
            // Inline edit form replaces this row.
            <div key={t.id} style={{ borderTop: "1px solid rgba(255,255,255,.05)", padding: 10 }}>
              <TypeForm
                initial={t}
                keyEditable={false}
                submitLabel="Save"
                onSave={(payload) => update(t.id, payload)}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "30px 110px 1fr 70px", gap: 10, padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.05)", alignItems: "center", fontSize: 12 }}>
              <span style={{ display: "grid", placeItems: "center", color: D.sub }}>
                <InstIcon type={t.key} customSvg={t.svg || null} lucideName={t.lucide_name || null} size={20} color={D.sub} accent={D.cyan} />
              </span>
              <span style={{ fontFamily: "Geist Mono", fontSize: 11, color: D.cyan }}>{t.key}</span>
              <span style={{ color: "#fff" }}>{t.label}</span>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                <button
                  onClick={() => { setEditingId(t.id); setShowNew(false); }}
                  title="Edit label + icon"
                  style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.ink, cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <UI name="edit" size={11} />
                </button>
                <button
                  onClick={() => remove(t)}
                  title="Delete"
                  style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid rgba(255,255,255,.10)", background: "transparent", color: D.bad, cursor: "pointer", display: "grid", placeItems: "center" }}
                >
                  <UI name="trash" size={11} />
                </button>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}
