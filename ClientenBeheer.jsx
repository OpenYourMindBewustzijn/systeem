import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { genereerFactuurPDF } from "./factuurPdf";

const PINK = "#F984E5";
const PAARS = "#8b5cf6";
const BTW = 0.21;
const STADIA = ["Startfase", "Bewustwording", "Verdieping", "Stabilisatie", "Integratie", "Afronding"];

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
  const [voortgang, setVoortgang] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNieuweKlant, setShowNieuweKlant] = useState(false);

  useEffect(() => {
    laadKlanten();
  }, []);

  async function laadKlanten() {
    setLoading(true);
    const { data: clientData, error } = await supabase
      .from("clients")
      .select("*")
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

  const gefilterd = clients.filter(
    (c) =>
      c.naam.toLowerCase().includes(search.toLowerCase()) ||
      (c.dossiernummer || "").toLowerCase().includes(search.toLowerCase())
  );

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
            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <input
                placeholder="Zoek op naam of dossiernummer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={inputStyle}
              />
              <button style={primaryBtn} onClick={() => setShowNieuweKlant(true)}>
                + Nieuwe klant
              </button>
            </div>

            {loading ? (
              <p style={{ color: "#999" }}>Laden...</p>
            ) : gefilterd.length === 0 ? (
              <EmptyState onNieuw={() => setShowNieuweKlant(true)} />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {gefilterd.map((c) => (
                  <KlantKaart
                    key={c.id}
                    client={c}
                    voortgang={voortgang[c.id]}
                    onClick={() => setSelectedId(c.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {selectedClient && (
          <KlantDetail
            client={selectedClient}
            voortgang={voortgang[selectedClient.id]}
            onBack={() => setSelectedId(null)}
            onUpdated={laadKlanten}
          />
        )}

        {showNieuweKlant && (
          <NieuweKlantModal
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
function KlantKaart({ client, voortgang, onClick }) {
  const resterend = voortgang ? voortgang.uren_resterend : client.pakket_uren_totaal;
  const gebruikt = voortgang ? voortgang.uren_gebruikt : 0;
  const percentage = Math.min(100, (gebruikt / client.pakket_uren_totaal) * 100);

  return (
    <div onClick={onClick} style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 17, color: "#111" }}>{client.naam}</div>
          <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>
            Dossier {client.dossiernummer || "—"}
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            padding: "3px 10px",
            borderRadius: 20,
            background: client.status === "actief" ? PINK : "#eee",
            color: client.status === "actief" ? "#fff" : "#888",
            fontWeight: 600,
          }}
        >
          {client.status}
        </span>
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
function KlantDetail({ client, voortgang, onBack, onUpdated }) {
  const [sessions, setSessions] = useState([]);
  const [showNieuweSessie, setShowNieuweSessie] = useState(false);
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
    if (!confirm(`Factuur maken voor deze sessie van ${formatDatum(sessie.datum)}?`)) return;

    const { data: nummerData } = await supabase.rpc("next_invoice_number");
    const factuurnummer = nummerData;
    const b = berekenBedrag(sessie);

    const { data: nieuweFactuur, error } = await supabase
      .from("invoices")
      .insert([
        {
          client_id: client.id,
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

    genereerFactuurPDF(nieuweFactuur, client, [{ ...sessie, subtotaal_excl_btw: b.subtotaal }]);

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
            <h2 style={{ margin: 0, fontSize: 24 }}>{client.naam}</h2>
            <p style={{ color: "#666", margin: "6px 0 0" }}>{client.adres || "Geen adres bekend"}</p>
          </div>
          <button style={primaryBtn} onClick={() => setShowNieuweSessie(true)}>
            + Sessieverslag
          </button>
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

        {client.algemene_notities && (
          <div style={{ marginTop: 16, fontSize: 14, color: "#444" }}>
            <strong>Algemene notities:</strong> {client.algemene_notities}
          </div>
        )}
      </div>

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
function NieuweKlantModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    naam: "",
    adres: "",
    dossiernummer: "",
    telefoon: "",
    email: "",
    pakket_uren_totaal: 40,
    algemene_notities: "",
  });
  const [saving, setSaving] = useState(false);

  async function opslaan() {
    if (!form.naam) return;
    setSaving(true);
    const { error } = await supabase.from("clients").insert([form]);
    setSaving(false);
    if (!error) onCreated();
    else alert("Er ging iets mis: " + error.message);
  }

  return (
    <Modal titel="Nieuwe klant" onClose={onClose}>
      <Field label="Naam *">
        <input style={inputStyle} value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
      </Field>
      <Field label="Adres">
        <input style={inputStyle} value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} />
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
