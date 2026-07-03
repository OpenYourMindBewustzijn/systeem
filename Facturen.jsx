import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [genererenBezig, setGenererenBezig] = useState(false);
  const [weergaveWeek, setWeergaveWeek] = useState(weekRange());
  const statusFilter = searchParams.get("status") || "alle";

  function setStatusFilter(status) {
    if (status === "alle") setSearchParams({});
    else setSearchParams({ status });
  }

  useEffect(() => {
    laadFacturen();
  }, []);

  async function laadFacturen() {
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("*, organisaties(naam, adres, contactpersoon)")
      .order("created_at", { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  }

  const gefilterdeInvoices = invoices.filter((f) => {
    if (statusFilter === "alle") return true;
    if (statusFilter === "gecrediteerd") return Boolean(f.credit_van_factuur_id) || f.status === "gecrediteerd";
    if (statusFilter === "verzonden") return f.status === "verzonden" && !f.credit_van_factuur_id;
    return f.status === statusFilter;
  });

  // Verzamelt alle niet-gefactureerde sessies binnen de geselecteerde week,
  // groepeert per ORGANISATIE (kan meerdere klanten omvatten) en maakt per organisatie één factuur aan.
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

    // Groeperen per organisatie
    const perOrganisatie = {};
    openstaandeSessies.forEach((s) => {
      const key = s.organisatie_id || "geen-organisatie";
      if (!perOrganisatie[key]) perOrganisatie[key] = [];
      perOrganisatie[key].push(s);
    });

    for (const organisatieId of Object.keys(perOrganisatie)) {
      if (organisatieId === "geen-organisatie") {
        alert(
          "Let op: er zijn sessies van klanten zonder gekoppelde organisatie. Die zijn overgeslagen — koppel eerst een organisatie bij de klant."
        );
        continue;
      }
      const sessies = perOrganisatie[organisatieId];
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
            organisatie_id: organisatieId,
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
    const { data: sessies } = await supabase
      .from("session_bedragen")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("datum", { ascending: true });

    genereerFactuurPDF(invoice, invoice.organisaties, sessies || []);
  }

  async function crediteerFactuur(invoice) {
    if (invoice.status === "gecrediteerd") {
      alert("Deze factuur is al gecrediteerd.");
      return;
    }
    if (invoice.credit_van_factuur_id) {
      alert("Dit is zelf al een creditfactuur, deze kan niet nogmaals gecrediteerd worden.");
      return;
    }
    if (
      !confirm(
        `Factuur ${invoice.factuurnummer} crediteren?\n\nEr wordt een creditfactuur aangemaakt en de gekoppelde sessies komen weer beschikbaar om opnieuw te factureren.`
      )
    )
      return;

    const { data: nummerData } = await supabase.rpc("next_invoice_number");
    const creditNummer = nummerData;

    const { data: creditFactuur, error } = await supabase
      .from("invoices")
      .insert([
        {
          organisatie_id: invoice.organisatie_id,
          factuurnummer: creditNummer,
          periode_start: invoice.periode_start,
          periode_eind: invoice.periode_eind,
          subtotaal: -invoice.subtotaal,
          btw_bedrag: -invoice.btw_bedrag,
          totaal: -invoice.totaal,
          status: "concept",
          credit_van_factuur_id: invoice.id,
        },
      ])
      .select()
      .single();

    if (error) {
      alert("Fout bij aanmaken creditfactuur: " + error.message);
      return;
    }

    // Haal de sessies op vóórdat we de koppeling loslaten (nodig voor de PDF)
    const { data: sessies } = await supabase
      .from("session_bedragen")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("datum", { ascending: true });

    // Origineel markeren als gecrediteerd
    await supabase.from("invoices").update({ status: "gecrediteerd" }).eq("id", invoice.id);

    // Sessies markeren als gecrediteerd — uren gaan terug naar het pakket
    await supabase
      .from("sessions")
      .update({ factuur_status: "gecrediteerd", invoice_id: null })
      .eq("invoice_id", invoice.id);

    genereerFactuurPDF(
      { ...creditFactuur, credit_van_factuurnummer: invoice.factuurnummer },
      invoice.organisaties,
      sessies || []
    );

    laadFacturen();
  }

  async function verstuurNaarEboekhouden(invoice) {
    if (invoice.eboekhouden_verstuurd) {
      alert("Deze factuur is al verstuurd naar e-Boekhouden.");
      return;
    }
    if (!confirm(`Factuur ${invoice.factuurnummer} versturen naar e-Boekhouden.nl?`)) return;

    try {
      const response = await fetch("/api/verstuur-naar-eboekhouden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        alert("Versturen mislukt: " + (result.error || "onbekende fout"));
        return;
      }
      alert("Factuur succesvol verstuurd naar e-Boekhouden.");
      laadFacturen();
    } catch (err) {
      alert("Versturen mislukt: " + err.message);
    }
  }

  function exporteerCSV() {
    const kolommen = [
      "Factuurnummer",
      "Organisatie",
      "Periode start",
      "Periode eind",
      "Subtotaal excl. btw",
      "Btw",
      "Totaal incl. btw",
      "Status",
      "Factuurdatum",
    ];
    const rijen = invoices.map((f) => [
      f.factuurnummer,
      f.organisaties?.naam || "",
      f.periode_start,
      f.periode_eind,
      Number(f.subtotaal).toFixed(2).replace(".", ","),
      Number(f.btw_bedrag).toFixed(2).replace(".", ","),
      Number(f.totaal).toFixed(2).replace(".", ","),
      f.status,
      new Date(f.created_at).toLocaleDateString("nl-NL"),
    ]);

    const csvInhoud = [kolommen, ...rijen]
      .map((rij) => rij.map((veld) => `"${String(veld).replace(/"/g, '""')}"`).join(";"))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvInhoud], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `facturen-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Facturen</h1>
          <p style={{ color: "#999", marginTop: 4, fontSize: 14 }}>Weekfacturen genereren en beheren</p>
        </header>

        {!loading && invoices.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <TotaalKaart
              label="Totaal (alle facturen)"
              waarde={euro(invoices.reduce((s, f) => s + Number(f.totaal), 0))}
              sub={`${invoices.length} facturen`}
              kleur="#8b5cf6"
              onClick={() => setStatusFilter("alle")}
            />
            <TotaalKaart
              label="Nog te ontvangen"
              waarde={euro(
                invoices
                  .filter((f) => f.status === "verzonden" && !f.credit_van_factuur_id)
                  .reduce((s, f) => s + Number(f.totaal), 0)
              )}
              sub="status: verzonden"
              kleur="#f59e0b"
              onClick={() => setStatusFilter("verzonden")}
            />
            <TotaalKaart
              label="Ontvangen"
              waarde={euro(
                invoices.filter((f) => f.status === "betaald").reduce((s, f) => s + Number(f.totaal), 0)
              )}
              sub="status: betaald"
              kleur="#22c55e"
              onClick={() => setStatusFilter("betaald")}
            />
            <TotaalKaart
              label="Gecrediteerd"
              waarde={euro(
                invoices.filter((f) => f.credit_van_factuur_id).reduce((s, f) => s + Number(f.totaal), 0)
              )}
              sub="creditfacturen"
              kleur="#c0392b"
              onClick={() => setStatusFilter("gecrediteerd")}
            />
          </div>
        )}

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
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={vorigeWeek} style={navBtn}>←</button>
            <div style={{ fontSize: 14 }}>
              Week: <strong>{fmtDatum(weergaveWeek.start)} – {fmtDatum(weergaveWeek.eind)}</strong>
            </div>
            <button onClick={volgendeWeek} style={navBtn}>→</button>
          </div>
          <button style={primaryBtn} onClick={genereerWeekfacturen} disabled={genererenBezig}>
            {genererenBezig ? "Bezig..." : "Genereer weekfacturen"}
          </button>
          <button style={secundaireBtn} onClick={exporteerCSV}>
            Exporteer CSV
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { key: "alle", label: "Alle" },
            { key: "concept", label: "Concept" },
            { key: "verzonden", label: "Openstaand (verzonden)" },
            { key: "betaald", label: "Betaald" },
            { key: "gecrediteerd", label: "Gecrediteerd" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                fontSize: 12,
                padding: "6px 14px",
                borderRadius: 20,
                border: "1px solid " + (statusFilter === f.key ? PINK : "#333"),
                background: statusFilter === f.key ? PINK : "transparent",
                color: statusFilter === f.key ? "#fff" : "#999",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#999" }}>Laden...</p>
        ) : gefilterdeInvoices.length === 0 ? (
          <p style={{ color: "#999" }}>Geen facturen in dit overzicht.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {gefilterdeInvoices.map((f) => (
              <div key={f.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "#111" }}>
                      {f.factuurnummer} — {f.organisaties?.naam || "Onbekende organisatie"}
                    </div>
                    <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>
                      Periode: {fmtDatum(f.periode_start)} – {fmtDatum(f.periode_eind)}
                    </div>
                  </div>
                  <select
                    value={f.status}
                    onChange={(e) => wijzigStatus(f, e.target.value)}
                    disabled={f.status === "gecrediteerd"}
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 20,
                      border: "1px solid #ddd",
                      background:
                        f.status === "betaald"
                          ? "#dcfce7"
                          : f.status === "verzonden"
                          ? "#dbeafe"
                          : f.status === "gecrediteerd"
                          ? "#fee2e2"
                          : "#f3f4f6",
                      color:
                        f.status === "betaald"
                          ? "#166534"
                          : f.status === "verzonden"
                          ? "#1e40af"
                          : f.status === "gecrediteerd"
                          ? "#c0392b"
                          : "#666",
                      fontWeight: 600,
                    }}
                  >
                    <option value="concept">concept</option>
                    <option value="verzonden">verzonden</option>
                    <option value="betaald">betaald</option>
                    {f.status === "gecrediteerd" && <option value="gecrediteerd">gecrediteerd</option>}
                  </select>
                </div>

                {f.credit_van_factuur_id && (
                  <div style={{ fontSize: 12, color: "#c0392b", marginTop: 4 }}>Creditfactuur</div>
                )}
                {f.eboekhouden_verstuurd && (
                  <div style={{ fontSize: 12, color: "#166534", marginTop: 4 }}>✓ Verstuurd naar e-Boekhouden</div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", gap: 18, fontSize: 14, color: "#333", flexWrap: "wrap" }}>
                    <span>Subtotaal: {euro(f.subtotaal)}</span>
                    <span>Btw: {euro(f.btw_bedrag)}</span>
                    <span style={{ fontWeight: 700 }}>Totaal: {euro(f.totaal)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!f.eboekhouden_verstuurd && f.status !== "gecrediteerd" && (
                      <button
                        style={{ ...secundaireBtn, fontSize: 13, padding: "6px 14px" }}
                        onClick={() => verstuurNaarEboekhouden(f)}
                      >
                        Naar e-Boekhouden
                      </button>
                    )}
                    {!f.credit_van_factuur_id && f.status !== "gecrediteerd" && (
                      <button
                        style={{ ...secundaireBtn, fontSize: 13, padding: "6px 14px", color: "#c0392b", borderColor: "#c0392b" }}
                        onClick={() => crediteerFactuur(f)}
                      >
                        Crediteren
                      </button>
                    )}
                    <button style={{ ...primaryBtn, fontSize: 13, padding: "6px 14px" }} onClick={() => downloadPDF(f)}>
                      PDF downloaden
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TotaalKaart({ label, waarde, sub, kleur, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 16,
        borderTop: `3px solid ${kleur}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: 11, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: "#111", marginTop: 4 }}>{waarde}</div>
      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const cardStyle = { background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" };
const primaryBtn = {
  background: PINK,
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 20px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 2px 6px rgba(249,132,229,0.35)",
  transition: "transform 0.1s ease, box-shadow 0.15s ease",
  whiteSpace: "nowrap",
};
const secundaireBtn = {
  background: "#fff",
  color: "#333",
  border: "1px solid #ddd",
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
