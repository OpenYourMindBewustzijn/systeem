import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const Ctx = createContext(null);
const OPSLAG_SLEUTEL = "oymb_actieve_werkruimte";

// Houdt bij in welke administratie (OYMB, Soulful Selflove, Bureau Sterk Na Geweld) je werkt.
export function WerkruimteProvider({ children }) {
  const [werkruimtes, setWerkruimtes] = useState([]);
  const [leden, setLeden] = useState([]); // { werkruimte_id, user_id, weergavenaam }
  const [ikId, setIkId] = useState(null);
  const [actiefId, setActiefId] = useState(null);
  const [klaar, setKlaar] = useState(false);

  const laad = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setIkId(u?.user?.id || null);
    const [{ data: w }, { data: l }] = await Promise.all([
      supabase.from("werkruimtes").select("*").order("naam", { ascending: true }),
      supabase.from("werkruimte_leden").select("*"),
    ]);
    setWerkruimtes(w || []);
    setLeden(l || []);
    let bewaard = null;
    try { bewaard = localStorage.getItem(OPSLAG_SLEUTEL); } catch (e) { /* geen opslag beschikbaar */ }
    setActiefId((huidig) => {
      const ids = (w || []).map((x) => x.id);
      if (huidig && ids.includes(huidig)) return huidig;
      if (bewaard && ids.includes(bewaard)) return bewaard;
      return ids[0] || null;
    });
    setKlaar(true);
  }, []);

  useEffect(() => { laad(); }, [laad]);

  function kiesWerkruimte(id) {
    setActiefId(id);
    try { localStorage.setItem(OPSLAG_SLEUTEL, id); } catch (e) { /* niet erg */ }
  }

  const actief = werkruimtes.find((w) => w.id === actiefId) || null;
  const ledenActief = leden.filter((l) => l.werkruimte_id === actiefId);
  const isGedeeld = ledenActief.length > 1;
  const naamVan = (userId) => leden.find((l) => l.user_id === userId)?.weergavenaam || "";
  // De eigen (privé) administratie van een lid: alleen dat lid zit erin
  const eigenWerkruimteVan = (userId) =>
    werkruimtes.find((w) => {
      const lw = leden.filter((l) => l.werkruimte_id === w.id);
      return lw.length === 1 && lw[0].user_id === userId;
    }) || null;

  return (
    <Ctx.Provider value={{ werkruimtes, actief, kiesWerkruimte, ledenActief, isGedeeld, ikId, naamVan, eigenWerkruimteVan, klaar, herlaad: laad }}>
      {children}
    </Ctx.Provider>
  );
}

export const useWerkruimte = () => useContext(Ctx);
