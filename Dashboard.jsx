import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const PINK = "#F984E5";
const PAARS = "#8b5cf6";

const euro = (n) => (n || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const fmtMaand = (d) => new Date(d).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
const fmtDatum = (d) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });

export default function Dashboard() {
  const [openstaand, setOpenstaand] = useState(null);
  const [omzetPerMaand, setOmzetPerMaand] = useState([]);
  const [statusVerdeling, setStatusVerdeling] = useState([]);
  const [teOntvangen, setTeOntvangen] = useState([]);
  const [bijnaVol, setBijnaVol] = useState([]);
  const [afspraken, setAfspraken] = useState([]);
  const [zonderAfspraak, setZonderAfspraak] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    laadAlles();
  }, []);

  async function laadAlles() {
    setLoading(true);
    const [openstaandRes, omzetRes, statusRes, teOntvangenRes, voortgangRes, klantenRes] = await Promise.all([
      supabase.from("dashboard_openstaand").select("*").single(),
      supabase.from("dashboard_omzet_per_maand").select("*").limit(12),
      supabase.from("dashboard_status_verdeling").select("*"),
      supabase.from("dashboard_te_ontvangen").select("*"),
      supabase.from("client_voortgang").select("*"),
      supabase.from("clients").select("id, naam, status, volgende_afspraak").order("volgende_afspraak", { ascending: true }),
    ]);

    setOpenstaand(openstaandRes.data);
    setOmzetPerMaand((omzetRes.data || []).reverse());
    setStatusVerdeling(statusRes.data || []);
    setTeOntvangen(teOntvangenRes.data || []);
    setBijnaVol((voortgangRes.data || []).filter((v) => v.uren_resterend <= 5 && v.uren_resterend >= 0));

    const klanten = klantenRes.data || [];
    const nu = new Date();
    setAfspraken(
      klanten
        .filter((k) => k.volgende_afspraak && new Date(k.volgende_afspraak) >= nu)
        .slice(0, 8)
    );
    setZonderAfspraak(klanten.filter((k) => !k.volgende_afspraak && k.status === "actief"));

    setLoading(false);
  }

  const ditJaar = new Date().getFullYear();
  const omzetDitJaar = omzetPerMaand
    .filter((m) => new Date(m.maand).getFullYear() === ditJaar)
    .reduce((sum, m) => sum + Number(m.omzet_excl_btw), 0);

  const dezeMaandLabel = new Date().toLocaleDateString("nl-NL", { month: "long" });
  const omzetDezeMaand = omzetPerMaand.find(
    (m) => new Date(m.maand).getMonth() === new Date().getMonth() && new Date(m.maand).getFullYear() === ditJaar
  );

  const maxOmzet = Math.max(...omzetPerMaand.map((m) => Number(m.omzet_excl_btw)), 1);

  const statusMap = {};
  statusVerdeling.forEach((s) => (statusMap[s.status] = s));

  const teOntvangenTotaal = teOntvangen.reduce((sum, f) => sum + Number(f.totaal), 0);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", color: "#999", display: "flex", alignItems: "center", justifyContent: "center" }}>
        Laden...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Dashboard</h1>
          <p style={{ color: "#999", marginTop: 4, fontSize: 14 }}>Overzicht van omzet en openstaande zaken</p>
        </header>

        {/* KPI-kaarten */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
          <KpiKaart
            label="Nog te factureren"
            waarde={euro(openstaand?.openstaand_excl_btw)}
            sub={`${openstaand?.aantal_sessies || 0} sessie${openstaand?.aantal_sessies === 1 ? "" : "s"}`}
            kleur={PINK}
          />
          <KpiKaart
            label={`Gefactureerd in ${dezeMaandLabel}`}
            waarde={euro(omzetDezeMaand?.omzet_excl_btw || 0)}
            sub={`${omzetDezeMaand?.aantal_facturen || 0} facturen`}
            kleur={PAARS}
          />
          <KpiKaart label={`Omzet ${ditJaar}`} waarde={euro(omzetDitJaar)} sub="excl. btw" kleur="#22c55e" />
          <KpiKaart
            label="Nog te ontvangen"
            waarde={euro(teOntvangenTotaal)}
            sub={`${teOntvangen.length} verzonden factu${teOntvangen.length === 1 ? "ur" : "ren"}`}
            kleur="#f59e0b"
          />
        </div>

        {/* Omzet per maand */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <h3 style={{ margin: "0 0 16px", color: "#111" }}>Omzet per maand (excl. btw)</h3>
          {omzetPerMaand.length === 0 ? (
            <p style={{ color: "#999", fontSize: 14 }}>Nog geen facturen.</p>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160 }}>
              {omzetPerMaand.map((m) => (
                <div key={m.maand} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 11, color: "#666" }}>{euro(m.omzet_excl_btw).replace(",00", "")}</div>
                  <div
                    style={{
                      width: "100%",
                      height: Math.max(4, (Number(m.omzet_excl_btw) / maxOmzet) * 120),
                      background: PINK,
                      borderRadius: "4px 4px 0 0",
                    }}
                  />
                  <div style={{ fontSize: 10, color: "#999", textAlign: "center" }}>
                    {new Date(m.maand).toLocaleDateString("nl-NL", { month: "short" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
          {/* Status verdeling */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#111" }}>Facturen per status</h3>
            {["concept", "verzonden", "betaald"].map((status) => {
              const s = statusMap[status];
              const kleur = status === "betaald" ? "#22c55e" : status === "verzonden" ? "#3b82f6" : "#999";
              return (
                <div key={status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: kleur }} />
                    <span style={{ fontSize: 14, color: "#333", textTransform: "capitalize" }}>{status}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{euro(s?.totaal_bedrag || 0)}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{s?.aantal || 0} stuks</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Klanten bijna door hun uren */}
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#111" }}>Bijna door hun uren</h3>
            {bijnaVol.length === 0 ? (
              <p style={{ color: "#999", fontSize: 14 }}>Geen klanten met minder dan 5 uur over.</p>
            ) : (
              bijnaVol.map((v) => (
                <div key={v.client_id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ fontSize: 14, color: "#333" }}>{v.naam}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: v.uren_resterend <= 2 ? "#c0392b" : "#f59e0b" }}>
                    {Number(v.uren_resterend).toFixed(1)} uur over
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Geplande afspraken */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, marginBottom: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#111" }}>Aankomende afspraken</h3>
            {afspraken.length === 0 ? (
              <p style={{ color: "#999", fontSize: 14 }}>Geen afspraken gepland.</p>
            ) : (
              afspraken.map((a) => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ fontSize: 14, color: "#333" }}>{a.naam}</span>
                  <span style={{ fontSize: 13, color: "#666" }}>
                    {new Date(a.volgende_afspraak).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                    {" · "}
                    {new Date(a.volgende_afspraak).toTimeString().slice(0, 5)}
                  </span>
                </div>
              ))
            )}
          </div>

          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}>
            <h3 style={{ margin: "0 0 16px", color: "#111" }}>Actief zonder vervolgafspraak</h3>
            {zonderAfspraak.length === 0 ? (
              <p style={{ color: "#999", fontSize: 14 }}>Alle actieve klanten hebben een afspraak gepland.</p>
            ) : (
              zonderAfspraak.map((k) => (
                <div key={k.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
                  <span style={{ fontSize: 14, color: "#333" }}>{k.naam}</span>
                  <span style={{ fontSize: 12, color: "#c0392b", fontWeight: 600 }}>⚠ Niet gepland</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Nog te ontvangen (verzonden, onbetaald) */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}>
          <h3 style={{ margin: "0 0 16px", color: "#111" }}>Openstaande facturen (verzonden, nog niet betaald)</h3>
          {teOntvangen.length === 0 ? (
            <p style={{ color: "#999", fontSize: 14 }}>Niets openstaand — mooi zo.</p>
          ) : (
            teOntvangen.map((f) => (
              <div key={f.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>{f.factuurnummer}</div>
                  <div style={{ fontSize: 12, color: "#999" }}>
                    {f.organisatie_naam || "—"} · verzonden {fmtDatum(f.created_at)}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", alignSelf: "center" }}>{euro(f.totaal)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KpiKaart({ label, waarde, sub, kleur }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 18, borderTop: `3px solid ${kleur}`, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#111", marginTop: 4 }}>{waarde}</div>
      <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{sub}</div>
    </div>
  );
}
