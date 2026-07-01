import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { genereerFactuurPDF } from "./factuurPdf";

const PINK = "#F984E5";
const BTW = 0.21;

const euro = (n) => (n || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const fmtDatum = (d) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

// Maandag t/m zondag van de week waar `datum` in valt
function weekRange(datum = new Date()) {
  const d = new Date(datum);
  const dag = (d.getDay() + 6) % 7; // maandag = 0
  const maandag = new Date(d);
  maandag.setDate(d.getDate() - dag);
  maandag.setHours(0, 0, 0, 0);
  const zondag = new Date(maandag);
  zondag.setDate(maandag.getDate() + 6);
  zondag.setHours(23, 59, 59, 999);
  return { start: maandag, eind: zondag };
}

export default function Facturen() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genererenBezig, setGenererenBezig] = useState(false);
  const [weergaveWeek, setWeergaveWeek] = useState(weekRange());

  useEffect(() => {
    laadFacturen();
  }, []);

  async function laadFacturen() {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*, clients(naam, adres, dossiernummer)")
      .order("created_at", { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  }

  // Verzamelt alle niet-gefactureerde sessies binnen de geselecteerde week,
  // groepeert per klant en maakt per klant één factuur aan.
  async function genereerWeekfacturen() {
    setGenererenBezig(true);
    const startISO = weergaveWeek.start.toISOString().slice(0, 10);
    const eindISO = weergaveWeek.eind.toISOString().slice(0, 10);

    const { data: openstaandeSessies, error } = await supabase
      .from("session_bedragen")
      .select("*")
      .eq("factuur_status", "niet gefactureerd")
      .gte("datum", startISO)
      .lte("datum", eindISO);

    if (error) {
      alert("Kon sessies niet ophalen: " + error.message);
      setGenererenBezig(false);
      return;
    }

    if (!openstaandeSessies || openstaandeSessies.length === 0) {
      alert("Geen openstaande sessies gevonden in deze week.");
      setGenererenBezig(false);
      return;
    }

    // Groeperen per klant
    const perKlant = {};
    openstaandeSessies.forEach((s) => {
      if (!perKlant[s.client_id]) perKlant[s.client_id] = [];
      perKlant[s.client_id].push(s);
    });

    for (const clientId of Object.keys(perKlant)) {
      const sessies = perKlant[clientId];
      const subtotaal = sessies.reduce((sum, s) => sum + Number(s.subtotaal_excl_btw), 0);
      const btwBedrag = subtotaal * BTW;
      const totaal = subtotaal + btwBedrag;

      // Volgend factuurnummer ophalen via database-functie
      const { data: nummerData } = await supabase.rpc("next_invoice_number");
      const factuurnummer = nummerData;

      const { data: nieuweFactuur, error: insertError } = await supabase
        .from("invoices")
        .insert([
          {
            client_id: clientId,
            factuurnummer,
            periode_start: startISO,
            periode_eind: eindISO,
            subtotaal,
            btw_bedrag: btwBedrag,
            totaal,
            status: "concept",
          },
        ])
        .select()
        .single();

      if (insertError) {
        alert("Fout bij aanmaken factuur: " + insertError.message);
        continue;
      }

      // Koppel de sessies aan deze factuur en markeer als gefactureerd
      const sessieIds = sessies.map((s) => s.session_id);
      await supabase
        .from("sessions")
        .update({ factuur_status: "gefactureerd", invoice_id: nieuweFactuur.id })
        .in("id", sessieIds);
    }

    setGenererenBezig(false);
    laadFacturen();
  }

  async function downloadPDF(invoice) {
    const { data: klant } = await supabase.from("clients").select("*").eq("id", invoice.client_id).single();
    const { data: sessies } = await supabase
      .from("session_bedragen")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("datum", { ascending: true });

    genereerFactuurPDF(invoice, klant, sessies || []);
  }

  async function wijzigStatus(invoice, nieuweStatus) {
    await supabase.from("invoices").update({ status: nieuweStatus }).eq("id", invoice.id);
    laadFacturen();
  }

  function vorigeWeek() {
    const nieuw = new Date(weergaveWeek.start);
    nieuw.setDate(nieuw.getDate() - 7);
    setWeergaveWeek(weekRange(nieuw));
  }
  function volgendeWeek() {
    const nieuw = new Date(weergaveWeek.start);
    nieuw.setDate(nieuw.getDate() + 7);
    setWeergaveWeek(weekRange(nieuw));
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "32px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Facturen</h1>
          <p style={{ color: "#999", marginTop: 4, fontSize: 14 }}>Weekfacturen genereren en beheren</p>
        </header>

        <div
          style={{
            background: "#111",
            border: "1px solid #333",
            borderRadius: 14,
            padding: 18,
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={vorigeWeek} style={navBtn}>←</button>
            <div style={{ fontSize: 14 }}>
              Week: <strong>{fmtDatum(weergaveWeek.start)} – {fmtDatum(weergaveWeek.eind)}</strong>
            </div>
            <button onClick={volgendeWeek} style={navBtn}>→</button>
          </div>
          <button style={primaryBtn} onClick={genereerWeekfacturen} disabled={genererenBezig}>
            {genererenBezig ? "Bezig..." : "Genereer weekfacturen"}
          </button>
        </div>

        {loading ? (
          <p style={{ color: "#999" }}>Laden...</p>
        ) : invoices.length === 0 ? (
          <p style={{ color: "#999" }}>Nog geen facturen.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {invoices.map((f) => (
              <div key={f.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "#111" }}>
                      {f.factuurnummer} — {f.clients?.naam}
                    </div>
                    <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>
                      Periode: {fmtDatum(f.periode_start)} – {fmtDatum(f.periode_eind)}
                    </div>
                  </div>
                  <select
                    value={f.status}
                    onChange={(e) => wijzigStatus(f, e.target.value)}
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 20,
                      border: "1px solid #ddd",
                      background: f.status === "betaald" ? "#dcfce7" : f.status === "verzonden" ? "#dbeafe" : "#f3f4f6",
                      color: f.status === "betaald" ? "#166534" : f.status === "verzonden" ? "#1e40af" : "#666",
                      fontWeight: 600,
                    }}
                  >
                    <option value="concept">concept</option>
                    <option value="verzonden">verzonden</option>
                    <option value="betaald">betaald</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
                  <div style={{ display: "flex", gap: 18, fontSize: 14, color: "#333", flexWrap: "wrap" }}>
                    <span>Subtotaal: {euro(f.subtotaal)}</span>
                    <span>Btw: {euro(f.btw_bedrag)}</span>
                    <span style={{ fontWeight: 700 }}>Totaal: {euro(f.totaal)}</span>
                  </div>
                  <button style={{ ...primaryBtn, fontSize: 13, padding: "6px 14px" }} onClick={() => downloadPDF(f)}>
                    PDF downloaden
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle = { background: "#fff", borderRadius: 14, padding: 18 };
const primaryBtn = {
  background: PINK,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 18px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const navBtn = {
  background: "#222",
  color: "#fff",
  border: "1px solid #333",
  borderRadius: 8,
  width: 32,
  height: 32,
  cursor: "pointer",
  fontSize: 14,
};
