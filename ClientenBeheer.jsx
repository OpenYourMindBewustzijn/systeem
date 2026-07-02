import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { genereerFactuurPDF } from "./factuurPdf";

const PINK = "#F984E5";
const PAARS = "#8b5cf6";
const BTW = 0.21;
const INTAKE_URL = "https://intakeformulier-gf82.vercel.app/";

function IntakeBlok({ client }) {
  const [mailStatus, setMailStatus] = useState("");

  async function verstuurViaMail() {
    if (!client.email) {
      alert("Deze klant heeft geen e-mailadres ingevuld.");
      return;
    }
    setMailStatus("bezig");
    try {
      const response = await fetch("/api/verstuur-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: client.email, naam: client.naam }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMailStatus("fout");
        alert("Versturen mislukt: " + (result.error || "onbekende fout"));
        return;
      }
      setMailStatus("verstuurd");
    } catch (err) {
      setMailStatus("fout");
      alert("Versturen mislukt: " + err.message);
    }
  }

  function verstuurViaWhatsapp() {
    if (!client.telefoon) {
      alert("Deze klant heeft geen telefoonnummer ingevuld.");
      return;
    }
    const bericht = `Hoi ${client.naam}, wil je het intakeformulier van Open Your Mind Bewustzijn invullen voor onze eerste sessie? ${INTAKE_URL}`;
    let nummer = client.telefoon.replace(/[^0-9]/g, "");
    if (nummer.startsWith("0")) nummer = "31" + nummer.slice(1);
    window.open(`https://wa.me/${nummer}?text=${encodeURIComponent(bericht)}`, "_blank");
  }

  return (
    <div style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 6 }}>Intakeformulier</h3>
      <p style={{ fontSize: 13, color: "#999", marginTop: 0, marginBottom: 14 }}>{INTAKE_URL}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={secundaireBtn} onClick={verstuurViaMail} disabled={mailStatus === "bezig"}>
          {mailStatus === "bezig" ? "Versturen..." : mailStatus === "verstuurd" ? "✓ Verstuurd" : "Verstuur via mail"}
        </button>
        <button style={{ ...secundaireBtn, color: "#22c55e", borderColor: "#22c55e" }} onClick={verstuurViaWhatsapp}>
          Verstuur via WhatsApp
        </button>
      </div>
    </div>
  );
}

const STADIA = ["Startfase", "Bewustwording", "Verdieping", "Stabilisatie", "Integratie", "Afronding"];
const STATUSSEN = ["nieuw", "actief", "niet actief", "issue"];
const statusKleur = (status) => {
  switch (status) {
    case "actief":
      return { bg: PINK, tekst: "#fff" };
    case "nieuw":
      return { bg: "#dbeafe", tekst: "#1e40af" };
    case "issue":
      return { bg: "#fee2e2", tekst: "#c0392b" };
    default:
      return { bg: "#eee", tekst: "#888" };
  }
};

function berekenBedrag(sessie) {
  const uren = (sessie.duur_minuten + (sessie.reistijd_minuten || 0)) / 60;
  const arbeid = uren * (sessie.uurtarief || 85);
  const km = (sessie.kilometers || 0) * (sessie.km_tarief || 0.23);
  const subtotaal = arbeid + km;
  const btw = subtotaal * BTW;
  return { arbeid, km, subtotaal, btw, totaal: subtotaal + btw };
}
const euro = (n) => (n || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

// ---------- Hulpfuncties ----------
const formatDatum = (d) =>
  new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

const urenLabel = (uren) => `${uren.toFixed(1)} uur`;

// ---------- Hoofdcomponent ----------
export default function ClientenBeheer() {
  const [clients, setClients] = useState([]);
  const [organisaties, setOrganisaties] = useState([]);
  const [voortgang, setVoortgang] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showNieuweKlant, setShowNieuweKlant] = useState(false);

  useEffect(() => {
    laadKlanten();
    laadOrganisaties();
  }, []);

  async function laadOrganisaties() {
    const { data } = await supabase.from("organisaties").select("*").order("naam", { ascending: true });
    setOrganisaties(data || []);
  }

  async function laadKlanten() {
    setLoading(true);
    const { data: clientData, error } = await supabase
      .from("clients")
      .select("*, organisaties(naam)")
      .order("naam", { ascending: true });

    const { data: voortgangData } = await supabase.from("client_voortgang").select("*");

    if (!error) setClients(clientData || []);
    if (voortgangData) {
      const map = {};
      voortgangData.forEach((v) => (map[v.client_id] = v));
      setVoortgang(map);
    }
    setLoading(false);
  }

  const [gefactureerdPerKlant, setGefactureerdPerKlant] = useState({});
  const [gefactureerdPerOrganisatie, setGefactureerdPerOrganisatie] = useState({});

  useEffect(() => {
    laadKlanten();
    laadOrganisaties();
    laadTotalen();
  }, []);

  async function laadTotalen() {
    const { data: klantTotalen } = await supabase.from("client_gefactureerd").select("*");
    const { data: orgTotalen } = await supabase.from("organisatie_gefactureerd").select("*");
    const klantMap = {};
    (klantTotalen || []).forEach((t) => (klantMap[t.client_id] = t));
    setGefactureerdPerKlant(klantMap);
    const orgMap = {};
    (orgTotalen || []).forEach((t) => (orgMap[t.organisatie_id] = t));
    setGefactureerdPerOrganisatie(orgMap);
  }

  const gefilterd = clients.filter((c) => {
    const zoekterm = search.toLowerCase();
    const matcht =
      c.naam.toLowerCase().includes(zoekterm) ||
      (c.dossiernummer || "").toLowerCase().includes(zoekterm) ||
      (c.plaats || "").toLowerCase().includes(zoekterm);
    const statusMatcht = statusFilter === "alle" || c.status === statusFilter;
    return matcht && statusMatcht;
  });

  // Groeperen per organisatie voor het overzicht
  const groepenPerOrganisatie = {};
  gefilterd.forEach((c) => {
    const key = c.organisatie_id || "geen";
    if (!groepenPerOrganisatie[key]) {
      groepenPerOrganisatie[key] = {
        naam: c.organisaties?.naam || "Geen organisatie gekoppeld",
        klanten: [],
      };
    }
    groepenPerOrganisatie[key].klanten.push(c);
  });

  const selectedClient = clients.find((c) => c.id === selectedId);

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Klanten</h1>
          <p style={{ color: "#999", marginTop: 4 }}>Dossiers, sessieverslagen en voortgang</p>
        </header>

        {!selectedClient && (
          <>
            <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <input
                placeholder="Zoek op naam, plaats of dossiernummer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1, minWidth: 200 }}
              />
              <button style={primaryBtn} onClick={() => setShowNieuweKlant(true)}>
                + Nieuwe klant
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["alle", ...STATUSSEN].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  style={{
                    fontSize: 12,
                    padding: "6px 14px",
                    borderRadius: 20,
                    border: "1px solid " + (statusFilter === s ? PINK : "#333"),
                    background: statusFilter === s ? PINK : "transparent",
                    color: statusFilter === s ? "#fff" : "#999",
                    fontWeight: 600,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {loading ? (
              <p style={{ color: "#999" }}>Laden...</p>
            ) : gefilterd.length === 0 ? (
              <EmptyState onNieuw={() => setShowNieuweKlant(true)} />
            ) : (
              <div style={{ display: "grid", gap: 24 }}>
                {Object.entries(groepenPerOrganisatie).map(([orgId, groep]) => {
                  const orgTotaal = gefactureerdPerOrganisatie[orgId];
                  return (
                    <div key={orgId}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          marginBottom: 10,
                          paddingBottom: 6,
                          borderBottom: "1px solid #333",
                        }}
                      >
                        <h3 style={{ margin: 0, fontSize: 15, color: "#bbb", fontWeight: 600 }}>{groep.naam}</h3>
                        <span style={{ fontSize: 13, color: "#8b5cf6", fontWeight: 600 }}>
                          Totaal gefactureerd: {euro(orgTotaal?.totaal_excl_btw || 0)}
                        </span>
                      </div>
                      <div style={{ display: "grid", gap: 12 }}>
                        {groep.klanten.map((c) => (
                          <KlantKaart
                            key={c.id}
                            client={c}
                            voortgang={voortgang[c.id]}
                            gefactureerd={gefactureerdPerKlant[c.id]}
                            onClick={() => setSelectedId(c.id)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {selectedClient && (
          <KlantDetail
            client={selectedClient}
            voortgang={voortgang[selectedClient.id]}
            gefactureerd={gefactureerdPerKlant[selectedClient.id]}
            organisaties={organisaties}
            onBack={() => setSelectedId(null)}
            onUpdated={() => {
              laadKlanten();
              laadTotalen();
            }}
          />
        )}

        {showNieuweKlant && (
          <NieuweKlantModal
            organisaties={organisaties}
            onClose={() => setShowNieuweKlant(false)}
            onCreated={() => {
              setShowNieuweKlant(false);
              laadKlanten();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Klantkaart in de lijst ----------
function KlantKaart({ client, voortgang, gefactureerd, onClick }) {
  const resterend = voortgang ? voortgang.uren_resterend : client.pakket_uren_totaal;
  const gebruikt = voortgang ? voortgang.uren_gebruikt : 0;
  const percentage = Math.min(100, (gebruikt / client.pakket_uren_totaal) * 100);
  const kleur = statusKleur(client.status);
  const geenAfspraak = !client.volgende_afspraak && client.status === "actief";

  return (
    <div onClick={onClick} style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 17, color: "#111" }}>{client.naam}</div>
          <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>
            Dossier {client.dossiernummer || "—"}
            {client.plaats && ` · ${client.plaats}`}
          </div>
          <div style={{ color: "#8b5cf6", fontSize: 12, marginTop: 2, fontWeight: 600 }}>
            Totaal gefactureerd: {euro(gefactureerd?.totaal_excl_btw || 0)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span
            style={{
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: 20,
              background: kleur.bg,
              color: kleur.tekst,
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {client.status}
          </span>
          {geenAfspraak && (
            <span style={{ fontSize: 11, color: "#c0392b", fontWeight: 600 }}>⚠ Geen vervolgafspraak</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#555" }}>
          <span>{urenLabel(gebruikt)} gebruikt</span>
          <span>{urenLabel(resterend)} resterend</span>
        </div>
        <div style={{ height: 6, background: "#eee", borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
          <div style={{ width: `${percentage}%`, height: "100%", background: PINK }} />
        </div>
      </div>
    </div>
  );
}

// ---------- Klant detailpagina ----------
function KlantDetail({ client, voortgang, gefactureerd, organisaties, onBack, onUpdated }) {
  const [sessions, setSessions] = useState([]);
  const [showNieuweSessie, setShowNieuweSessie] = useState(false);
  const [showBewerken, setShowBewerken] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    laadSessies();
  }, [client.id]);

  async function laadSessies() {
    setLoading(true);
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .eq("client_id", client.id)
      .order("datum", { ascending: false });
    setSessions(data || []);
    setLoading(false);
  }

  const totaalReistijd = sessions.reduce((sum, s) => sum + (s.reistijd_minuten || 0), 0);
  const totaalKm = sessions.reduce((sum, s) => sum + (Number(s.kilometers) || 0), 0);

  async function directFactureren(sessie) {
    if (!client.organisatie_id) {
      alert(
        "Deze klant heeft nog geen organisatie gekoppeld. Ga naar de klantgegevens en koppel eerst een organisatie voordat je kunt factureren."
      );
      return;
    }
    if (!confirm(`Factuur maken voor deze sessie van ${formatDatum(sessie.datum)}?`)) return;

    const { data: nummerData } = await supabase.rpc("next_invoice_number");
    const factuurnummer = nummerData;
    const b = berekenBedrag(sessie);

    const { data: nieuweFactuur, error } = await supabase
      .from("invoices")
      .insert([
        {
          organisatie_id: client.organisatie_id,
          factuurnummer,
          periode_start: sessie.datum,
          periode_eind: sessie.datum,
          subtotaal: b.subtotaal,
          btw_bedrag: b.btw,
          totaal: b.totaal,
          status: "concept",
        },
      ])
      .select()
      .single();

    if (error) {
      alert("Fout bij aanmaken factuur: " + error.message);
      return;
    }

    await supabase
      .from("sessions")
      .update({ factuur_status: "gefactureerd", invoice_id: nieuweFactuur.id })
      .eq("id", sessie.id);

    const { data: organisatieData } = await supabase
      .from("organisaties")
      .select("*")
      .eq("id", client.organisatie_id)
      .single();

    genereerFactuurPDF(nieuweFactuur, organisatieData, [
      { ...sessie, subtotaal_excl_btw: b.subtotaal, client_naam: client.naam },
    ]);

    laadSessies();
    onUpdated();
  }

  return (
    <div>
      <button onClick={onBack} style={backBtn}>
        ← Terug naar klanten
      </button>

      <div style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 24 }}>{client.naam}</h2>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 10px",
                  borderRadius: 20,
                  textTransform: "capitalize",
                  fontWeight: 600,
                  background: statusKleur(client.status).bg,
                  color: statusKleur(client.status).tekst,
                }}
              >
                {client.status}
              </span>
            </div>
            <p style={{ color: "#666", margin: "6px 0 0" }}>
              {client.adres || "Geen adres bekend"}
              {client.plaats ? `, ${client.plaats}` : ""}
            </p>
            {client.organisaties?.naam ? (
              <p style={{ color: "#8b5cf6", margin: "4px 0 0", fontSize: 13, fontWeight: 600 }}>
                Organisatie: {client.organisaties.naam}
              </p>
            ) : (
              <p style={{ color: "#c0392b", margin: "4px 0 0", fontSize: 13, fontWeight: 600 }}>
                ⚠ Geen organisatie gekoppeld — factureren nog niet mogelijk
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={secundaireBtn} onClick={() => setShowBewerken(true)}>
              Bewerken
            </button>
            <button style={primaryBtn} onClick={() => setShowNieuweSessie(true)}>
              + Sessieverslag
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 20 }}>
          <Stat label="Dossiernr." value={client.dossiernummer || "—"} />
          <Stat label="Uren gebruikt" value={urenLabel(voortgang?.uren_gebruikt || 0)} />
          <Stat label="Uren resterend" value={urenLabel(voortgang?.uren_resterend ?? client.pakket_uren_totaal)} />
          <Stat label="Aantal sessies" value={sessions.length} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 12 }}>
          <Stat label="Totale reistijd" value={`${Math.round(totaalReistijd / 60)} u ${totaalReistijd % 60} min`} />
          <Stat label="Totaal km" value={`${totaalKm.toFixed(1)} km`} />
        </div>

        <div style={{ marginTop: 12 }}>
          <Stat label="Totaal gefactureerd" value={euro(gefactureerd?.totaal_excl_btw || 0)} />
        </div>

        {client.algemene_notities && (
          <div style={{ marginTop: 16, fontSize: 14, color: "#444" }}>
            <strong>Algemene notities:</strong> {client.algemene_notities}
          </div>
        )}
      </div>

      <VervolgafspraakBlok client={client} onUpdated={onUpdated} />
      <IntakeBlok client={client} />
      <VoortgangBlok client={client} onUpdated={onUpdated} />

      <h3 style={{ marginBottom: 12 }}>Sessieverslagen</h3>

      {loading ? (
        <p style={{ color: "#999" }}>Laden...</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: "#999" }}>Nog geen sessies vastgelegd.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {sessions.map((s) => (
            <SessieKaart key={s.id} sessie={s} onFactureer={directFactureren} />
          ))}
        </div>
      )}

      {showNieuweSessie && (
        <NieuweSessieModal
          clientId={client.id}
          onClose={() => setShowNieuweSessie(false)}
          onCreated={() => {
            setShowNieuweSessie(false);
            laadSessies();
            onUpdated();
          }}
        />
      )}

      {showBewerken && (
        <BewerkKlantModal
          client={client}
          organisaties={organisaties}
          onClose={() => setShowBewerken(false)}
          onOpgeslagen={() => {
            setShowBewerken(false);
            onUpdated();
          }}
        />
      )}
    </div>
  );
}

// ---------- Vervolgafspraak-blok ----------
function googleAgendaLink({ titel, beschrijving, locatie, start, eindMinutenLater }) {
  const eind = new Date(start.getTime() + eindMinutenLater * 60000);
  const fmt = (d) => d.toISOString().replace(/-|:|\.\d\d\d/g, "");
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", titel);
  url.searchParams.set("dates", `${fmt(start)}/${fmt(eind)}`);
  url.searchParams.set("details", beschrijving || "");
  url.searchParams.set("location", locatie || "");
  return url.toString();
}

function VervolgafspraakBlok({ client, onUpdated }) {
  const huidigeWaarde = client.volgende_afspraak ? new Date(client.volgende_afspraak) : null;
  const [datum, setDatum] = useState(huidigeWaarde ? huidigeWaarde.toISOString().slice(0, 10) : "");
  const [tijd, setTijd] = useState(huidigeWaarde ? huidigeWaarde.toTimeString().slice(0, 5) : "10:00");
  const [duur, setDuur] = useState(75);
  const [locatie, setLocatie] = useState(
    client.adres ? `${client.adres}${client.plaats ? ", " + client.plaats : ""}` : ""
  );
  const [bezig, setBezig] = useState(false);
  const [mailStatus, setMailStatus] = useState("");

  const geenAfspraak = !client.volgende_afspraak;

  async function afspraakPlannen() {
    if (!datum) {
      alert("Kies eerst een datum.");
      return;
    }
    setBezig(true);
    const startDatumTijd = new Date(`${datum}T${tijd}`);

    // 1. Opslaan in het klantdossier (voor de "geen vervolgafspraak"-waarschuwing)
    await supabase.from("clients").update({ volgende_afspraak: startDatumTijd.toISOString() }).eq("id", client.id);

    // 2. Google Agenda openen met alles al ingevuld — jij bevestigt zelf met opslaan
    const link = googleAgendaLink({
      titel: `Afspraak met ${client.naam}`,
      beschrijving: `Begeleidingssessie met ${client.naam}${client.dossiernummer ? ` (dossier ${client.dossiernummer})` : ""}`,
      locatie: locatie,
      start: startDatumTijd,
      eindMinutenLater: duur,
    });
    window.open(link, "_blank");

    setBezig(false);
    onUpdated();
  }

  async function bevestigingVersturen() {
    if (!client.email) {
      alert("Deze klant heeft geen e-mailadres ingevuld.");
      return;
    }
    if (!datum) {
      alert("Kies eerst een datum voordat je een bevestiging verstuurt.");
      return;
    }
    setMailStatus("bezig");
    const startDatumTijd = new Date(`${datum}T${tijd}`);
    try {
      const response = await fetch("/api/verstuur-afspraakbevestiging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: client.email,
          naam: client.naam,
          datumTijd: startDatumTijd.toISOString(),
          duurMinuten: duur,
          locatie: locatie,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMailStatus("fout");
        alert("Versturen mislukt: " + (result.error || "onbekende fout"));
        return;
      }
      setMailStatus("verstuurd");
    } catch (err) {
      setMailStatus("fout");
      alert("Versturen mislukt: " + err.message);
    }
  }

  function whatsappVersturen() {
    if (!client.telefoon) {
      alert("Deze klant heeft geen telefoonnummer ingevuld.");
      return;
    }
    if (!datum) {
      alert("Kies eerst een datum.");
      return;
    }
    const startDatumTijd = new Date(`${datum}T${tijd}`);
    const datumLabel = startDatumTijd.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
    const bericht = `Hoi ${client.naam}, je afspraak bij Open Your Mind Bewustzijn staat gepland op ${datumLabel} om ${tijd} uur.${
      locatie ? ` Locatie: ${locatie}.` : ""
    } Tot dan!`;
    let nummer = client.telefoon.replace(/[^0-9]/g, "");
    if (nummer.startsWith("0")) nummer = "31" + nummer.slice(1);
    const link = `https://wa.me/${nummer}?text=${encodeURIComponent(bericht)}`;
    window.open(link, "_blank");
  }

  return (
    <div style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 14 }}>Vervolgafspraak</h3>
      {geenAfspraak && (
        <div
          style={{
            background: "#fee2e2",
            color: "#c0392b",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          ⚠ Geen vervolgafspraak gepland
        </div>
      )}
      {!geenAfspraak && (
        <div style={{ fontSize: 14, color: "#555", marginBottom: 12 }}>
          Gepland op {huidigeWaarde.toLocaleDateString("nl-NL", { day: "numeric", month: "long" })} om{" "}
          {huidigeWaarde.toTimeString().slice(0, 5)}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div>
          <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>Datum</label>
          <input type="date" style={inputStyle} value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>Tijd</label>
          <input type="time" style={inputStyle} value={tijd} onChange={(e) => setTijd(e.target.value)} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>Duur (min)</label>
          <input
            type="number"
            style={{ ...inputStyle, width: 90 }}
            value={duur}
            onChange={(e) => setDuur(Number(e.target.value))}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>Locatie</label>
        <input
          style={inputStyle}
          value={locatie}
          onChange={(e) => setLocatie(e.target.value)}
          placeholder="Bijv. adres van de klant, of je praktijkadres"
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={primaryBtn} onClick={afspraakPlannen} disabled={bezig}>
          {bezig ? "Bezig..." : "Plan in Google Agenda"}
        </button>
        <button style={secundaireBtn} onClick={bevestigingVersturen} disabled={mailStatus === "bezig"}>
          {mailStatus === "bezig"
            ? "Versturen..."
            : mailStatus === "verstuurd"
            ? "✓ Bevestiging verstuurd"
            : "Verstuur bevestiging per mail"}
        </button>
        <button style={{ ...secundaireBtn, color: "#22c55e", borderColor: "#22c55e" }} onClick={whatsappVersturen}>
          Verstuur via WhatsApp
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function SessieKaart({ sessie, onFactureer }) {
  const b = berekenBedrag(sessie);
  return (
    <div style={{ ...cardStyle, cursor: "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 600, color: "#111" }}>{formatDatum(sessie.datum)}</div>
        <div style={{ color: "#888", fontSize: 13 }}>
          {sessie.duur_minuten} min sessie · {sessie.reistijd_minuten || 0} min reistijd · {sessie.kilometers || 0} km
        </div>
      </div>
      {sessie.verslag && (
        <div style={{ marginTop: 10, fontSize: 14, color: "#333" }}>
          <strong>Verslag:</strong> {sessie.verslag}
        </div>
      )}
      {sessie.progressie && (
        <div style={{ marginTop: 8, fontSize: 14, color: "#333" }}>
          <strong>Progressie:</strong> {sessie.progressie}
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px dashed #ddd",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, color: "#555" }}>
          Arbeid {euro(b.arbeid)} + km {euro(b.km)} · btw {euro(b.btw)} ·{" "}
          <strong style={{ color: "#111" }}>totaal {euro(b.totaal)}</strong>
        </div>
        {sessie.factuur_status === "gefactureerd" ? (
          <span
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 20,
              background: "#dcfce7",
              color: "#166534",
              fontWeight: 600,
            }}
          >
            ✓ Gefactureerd
          </span>
        ) : (
          <button style={{ ...primaryBtn, fontSize: 13, padding: "6px 14px" }} onClick={() => onFactureer(sessie)}>
            Direct factureren
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Voortgang naar eindstadium ----------
function VoortgangBlok({ client, onUpdated }) {
  const [stadium, setStadium] = useState(client.voortgang_stadium || "Startfase");
  const [percentage, setPercentage] = useState(client.voortgang_percentage || 0);
  const [notitie, setNotitie] = useState(client.voortgang_notitie || "");
  const [saving, setSaving] = useState(false);

  async function opslaan() {
    setSaving(true);
    await supabase
      .from("clients")
      .update({ voortgang_stadium: stadium, voortgang_percentage: percentage, voortgang_notitie: notitie })
      .eq("id", client.id);
    setSaving(false);
    onUpdated();
  }

  return (
    <div style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <h3 style={{ marginTop: 0, marginBottom: 14 }}>Voortgang naar eindstadium</h3>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {STADIA.map((st) => (
          <button
            key={st}
            onClick={() => setStadium(st)}
            style={{
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 20,
              border: "none",
              cursor: "pointer",
              background: st === stadium ? PAARS : "#f2f2f2",
              color: st === stadium ? "#fff" : "#888",
              fontWeight: 600,
            }}
          >
            {st}
          </button>
        ))}
      </div>

      <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 6 }}>
        Percentage richting afronding: {percentage}%
      </label>
      <input
        type="range"
        min="0"
        max="100"
        value={percentage}
        onChange={(e) => setPercentage(Number(e.target.value))}
        style={{ width: "100%", accentColor: PAARS }}
      />

      <label style={{ display: "block", fontSize: 13, color: "#555", margin: "14px 0 6px" }}>Notitie</label>
      <textarea
        style={{ ...inputStyle, minHeight: 70 }}
        value={notitie}
        onChange={(e) => setNotitie(e.target.value)}
        placeholder="Korte observatie over de voortgang..."
      />

      <button style={{ ...primaryBtn, marginTop: 12 }} onClick={opslaan} disabled={saving}>
        {saving ? "Opslaan..." : "Voortgang opslaan"}
      </button>
    </div>
  );
}

// ---------- Modal: nieuwe klant ----------
function NieuweKlantModal({ organisaties, onClose, onCreated }) {
  const [form, setForm] = useState({
    naam: "",
    adres: "",
    plaats: "",
    dossiernummer: "",
    telefoon: "",
    email: "",
    pakket_uren_totaal: 40,
    algemene_notities: "",
    organisatie_id: organisaties?.[0]?.id || "",
    status: "nieuw",
  });
  const [saving, setSaving] = useState(false);
  const [lokaleOrganisaties, setLokaleOrganisaties] = useState(organisaties || []);
  const [nieuweOrgForm, setNieuweOrgForm] = useState({ naam: "", adres: "", contactpersoon: "", email: "" });
  const [orgToevoegen, setOrgToevoegen] = useState(false);

  async function organisatieToevoegen() {
    if (!nieuweOrgForm.naam.trim()) return;
    const { data, error } = await supabase.from("organisaties").insert([nieuweOrgForm]).select().single();
    if (error) {
      alert("Kon organisatie niet toevoegen: " + error.message);
      return;
    }
    setLokaleOrganisaties((prev) => [...prev, data]);
    setForm((f) => ({ ...f, organisatie_id: data.id }));
    setNieuweOrgForm({ naam: "", adres: "", contactpersoon: "", email: "" });
    setOrgToevoegen(false);
  }

  async function opslaan() {
    if (!form.naam) return;
    setSaving(true);
    const payload = { ...form, organisatie_id: form.organisatie_id || null };
    const { error } = await supabase.from("clients").insert([payload]);
    setSaving(false);
    if (!error) onCreated();
    else alert("Er ging iets mis: " + error.message);
  }

  return (
    <Modal titel="Nieuwe klant" onClose={onClose}>
      <Field label="Naam *">
        <input style={inputStyle} value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
      </Field>
      <Field label="Organisatie">
        {!orgToevoegen ? (
          <div style={{ display: "flex", gap: 8 }}>
            <select
              style={{ ...inputStyle, flex: 1 }}
              value={form.organisatie_id}
              onChange={(e) => setForm({ ...form, organisatie_id: e.target.value })}
            >
              <option value="">— Geen organisatie —</option>
              {lokaleOrganisaties.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.naam}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setOrgToevoegen(true)}
              style={{ ...primaryBtn, padding: "8px 12px", fontSize: 13 }}
            >
              + Nieuw
            </button>
          </div>
        ) : (
          <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 12 }}>
            <input
              style={{ ...inputStyle, marginBottom: 8 }}
              placeholder="Naam organisatie *"
              value={nieuweOrgForm.naam}
              onChange={(e) => setNieuweOrgForm({ ...nieuweOrgForm, naam: e.target.value })}
              autoFocus
            />
            <textarea
              style={{ ...inputStyle, marginBottom: 8, minHeight: 50 }}
              placeholder="Adres (voor op de factuur)"
              value={nieuweOrgForm.adres}
              onChange={(e) => setNieuweOrgForm({ ...nieuweOrgForm, adres: e.target.value })}
            />
            <input
              style={{ ...inputStyle, marginBottom: 8 }}
              placeholder="Contactpersoon"
              value={nieuweOrgForm.contactpersoon}
              onChange={(e) => setNieuweOrgForm({ ...nieuweOrgForm, contactpersoon: e.target.value })}
            />
            <input
              style={{ ...inputStyle, marginBottom: 10 }}
              placeholder="E-mailadres (voor facturen)"
              value={nieuweOrgForm.email}
              onChange={(e) => setNieuweOrgForm({ ...nieuweOrgForm, email: e.target.value })}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={organisatieToevoegen}
                style={{ ...primaryBtn, padding: "8px 12px", fontSize: 13, flex: 1 }}
              >
                Organisatie opslaan
              </button>
              <button
                type="button"
                onClick={() => setOrgToevoegen(false)}
                style={{ background: "none", border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
              >
                Annuleren
              </button>
            </div>
          </div>
        )}
      </Field>
      <Field label="Adres">
        <input style={inputStyle} value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} />
      </Field>
      <Field label="Plaats">
        <input style={inputStyle} value={form.plaats} onChange={(e) => setForm({ ...form, plaats: e.target.value })} />
      </Field>
      <Field label="Dossiernummer">
        <input
          style={inputStyle}
          value={form.dossiernummer}
          onChange={(e) => setForm({ ...form, dossiernummer: e.target.value })}
        />
      </Field>
      <Field label="Telefoon">
        <input
          style={inputStyle}
          value={form.telefoon}
          onChange={(e) => setForm({ ...form, telefoon: e.target.value })}
        />
      </Field>
      <Field label="E-mail">
        <input style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Pakket uren totaal">
        <input
          type="number"
          style={inputStyle}
          value={form.pakket_uren_totaal}
          onChange={(e) => setForm({ ...form, pakket_uren_totaal: Number(e.target.value) })}
        />
      </Field>
      <Field label="Algemene notities">
        <textarea
          style={{ ...inputStyle, minHeight: 80 }}
          value={form.algemene_notities}
          onChange={(e) => setForm({ ...form, algemene_notities: e.target.value })}
        />
      </Field>

      <button style={{ ...primaryBtn, width: "100%", marginTop: 8 }} onClick={opslaan} disabled={saving}>
        {saving ? "Opslaan..." : "Klant toevoegen"}
      </button>
    </Modal>
  );
}

// ---------- Modal: klant bewerken ----------
function BewerkKlantModal({ client, organisaties, onClose, onOpgeslagen }) {
  const [form, setForm] = useState({
    naam: client.naam || "",
    adres: client.adres || "",
    plaats: client.plaats || "",
    dossiernummer: client.dossiernummer || "",
    telefoon: client.telefoon || "",
    email: client.email || "",
    pakket_uren_totaal: client.pakket_uren_totaal || 40,
    algemene_notities: client.algemene_notities || "",
    organisatie_id: client.organisatie_id || "",
    status: client.status || "nieuw",
  });
  const [saving, setSaving] = useState(false);

  async function opslaan() {
    if (!form.naam) return;
    setSaving(true);
    const payload = { ...form, organisatie_id: form.organisatie_id || null };
    const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
    setSaving(false);
    if (!error) onOpgeslagen();
    else alert("Er ging iets mis: " + error.message);
  }

  return (
    <Modal titel="Klant bewerken" onClose={onClose}>
      <Field label="Naam *">
        <input style={inputStyle} value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
      </Field>
      <Field label="Status">
        <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {STATUSSEN.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Organisatie">
        <select
          style={inputStyle}
          value={form.organisatie_id}
          onChange={(e) => setForm({ ...form, organisatie_id: e.target.value })}
        >
          <option value="">— Geen organisatie —</option>
          {(organisaties || []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.naam}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Adres">
        <input style={inputStyle} value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} />
      </Field>
      <Field label="Plaats">
        <input style={inputStyle} value={form.plaats} onChange={(e) => setForm({ ...form, plaats: e.target.value })} />
      </Field>
      <Field label="Dossiernummer">
        <input
          style={inputStyle}
          value={form.dossiernummer}
          onChange={(e) => setForm({ ...form, dossiernummer: e.target.value })}
        />
      </Field>
      <Field label="Telefoon">
        <input
          style={inputStyle}
          value={form.telefoon}
          onChange={(e) => setForm({ ...form, telefoon: e.target.value })}
        />
      </Field>
      <Field label="E-mail">
        <input style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label="Pakket uren totaal">
        <input
          type="number"
          style={inputStyle}
          value={form.pakket_uren_totaal}
          onChange={(e) => setForm({ ...form, pakket_uren_totaal: Number(e.target.value) })}
        />
      </Field>
      <Field label="Algemene notities">
        <textarea
          style={{ ...inputStyle, minHeight: 80 }}
          value={form.algemene_notities}
          onChange={(e) => setForm({ ...form, algemene_notities: e.target.value })}
        />
      </Field>

      <button style={{ ...primaryBtn, width: "100%", marginTop: 8 }} onClick={opslaan} disabled={saving}>
        {saving ? "Opslaan..." : "Wijzigingen opslaan"}
      </button>
    </Modal>
  );
}

// ---------- Modal: nieuwe sessie ----------
function NieuweSessieModal({ clientId, onClose, onCreated }) {
  const [form, setForm] = useState({
    datum: new Date().toISOString().slice(0, 10),
    duur_minuten: 75,
    reistijd_minuten: 0,
    kilometers: 0,
    uurtarief: 85,
    km_tarief: 0.23,
    verslag: "",
    progressie: "",
  });
  const [saving, setSaving] = useState(false);

  async function opslaan() {
    setSaving(true);
    const { error } = await supabase.from("sessions").insert([{ ...form, client_id: clientId }]);
    setSaving(false);
    if (!error) onCreated();
    else alert("Er ging iets mis: " + error.message);
  }

  return (
    <Modal titel="Nieuw sessieverslag" onClose={onClose}>
      <Field label="Datum">
        <input
          type="date"
          style={inputStyle}
          value={form.datum}
          onChange={(e) => setForm({ ...form, datum: e.target.value })}
        />
      </Field>
      <Field label="Duur sessie (minuten)">
        <input
          type="number"
          style={inputStyle}
          value={form.duur_minuten}
          onChange={(e) => setForm({ ...form, duur_minuten: Number(e.target.value) })}
        />
      </Field>
      <Field label="Reistijd (minuten)">
        <input
          type="number"
          style={inputStyle}
          value={form.reistijd_minuten}
          onChange={(e) => setForm({ ...form, reistijd_minuten: Number(e.target.value) })}
        />
      </Field>
      <Field label="Kilometers">
        <input
          type="number"
          step="0.1"
          style={inputStyle}
          value={form.kilometers}
          onChange={(e) => setForm({ ...form, kilometers: Number(e.target.value) })}
        />
      </Field>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Field label="Uurtarief (€)">
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.uurtarief}
              onChange={(e) => setForm({ ...form, uurtarief: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Km-vergoeding (€/km)">
            <input
              type="number"
              step="0.01"
              style={inputStyle}
              value={form.km_tarief}
              onChange={(e) => setForm({ ...form, km_tarief: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "#666", marginBottom: 14, background: "#f9f9f9", padding: "8px 12px", borderRadius: 8 }}>
        Geschat bedrag: <strong>{euro(berekenBedrag(form).totaal)}</strong> incl. btw
      </div>
      <Field label="Verslag van de sessie">
        <textarea
          style={{ ...inputStyle, minHeight: 100 }}
          value={form.verslag}
          onChange={(e) => setForm({ ...form, verslag: e.target.value })}
        />
      </Field>
      <Field label="Progressie / observaties">
        <textarea
          style={{ ...inputStyle, minHeight: 100 }}
          value={form.progressie}
          onChange={(e) => setForm({ ...form, progressie: e.target.value })}
        />
      </Field>

      <button style={{ ...primaryBtn, width: "100%", marginTop: 8 }} onClick={opslaan} disabled={saving}>
        {saving ? "Opslaan..." : "Verslag opslaan"}
      </button>
    </Modal>
  );
}

// ---------- Kleine UI-bouwstenen ----------
function Modal({ titel, onClose, children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 24, width: 480, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{titel}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ onNieuw }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#999" }}>
      <p>Nog geen klanten toegevoegd.</p>
      <button style={primaryBtn} onClick={onNieuw}>
        + Eerste klant toevoegen
      </button>
    </div>
  );
}

// ---------- Gedeelde stijlen ----------
const cardStyle = {
  background: "#fff",
  borderRadius: 14,
  padding: 18,
  cursor: "pointer",
  transition: "transform 0.15s ease",
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 14,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

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

const backBtn = {
  background: "none",
  border: "none",
  color: PINK,
  fontWeight: 600,
  marginBottom: 16,
  cursor: "pointer",
  fontSize: 14,
  padding: 0,
};
