// Provides a key→InstrumentType lookup so any <InstIcon type="orbitrap"/>
// call can automatically render whatever custom SVG / lucide icon the admin
// configured for that type. Without this, InstIcon would always fall back
// to the built-in ICON_MAP for callers that only have the icon_type string.
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const Ctx = createContext({ byKey: {}, refresh: () => {} });

export function InstrumentTypesProvider({ children }) {
  const [byKey, setByKey] = useState({});
  async function refresh() {
    try {
      const rows = await api.instrumentTypes();
      const map = {};
      for (const t of rows) map[t.key] = t;
      setByKey(map);
    } catch { /* not authed yet — ignore */ }
  }
  useEffect(() => {
    refresh();
    // Refresh occasionally so admin edits propagate without manual reload.
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);
  return <Ctx.Provider value={{ byKey, refresh }}>{children}</Ctx.Provider>;
}

export function useInstrumentTypes() {
  return useContext(Ctx);
}
