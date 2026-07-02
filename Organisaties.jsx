import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const PINK = "#F984E5";

export default function Organisaties() {
  const [organisaties, setOrganisaties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showNieuw, setShowNieuw] = useState(false);

  useEffect(() => {
    laadOrganisaties();
  }, []);

  async function laadOrganisaties() {
    setLoading(true);
    const { data } = await supabase.from("organisaties").select("*").order("naam", { ascending: true });
    setOrganisaties(data || []);
    setLoading(false);
  }

  const selected = organisaties.find((o) => o.id === selectedId);

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "32px 20px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Organisaties</h1>
          <p style={{ color: "#999", marginTop: 4, fontSize: 14 }}>
            Hoofdorganisaties (bijv. Klavertje 4) en hun factuurgegevens
          </p>
        </header>

        {!selected && (
          <>
            <button style={{ ...primaryBtn, marginBottom: 20 }} onClick={() => setShowNieuw(true)}>
              + Nieuwe organisatie
            </button>

            {loading ? (
              <p style={{ color: "#999" }}>Laden...</p>
            ) : organisaties.length === 0 ? (
              <p style={{ color: "#999" }}>Nog geen organisaties toegevoegd.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {organisaties.map((o) => (
                  <div key={o.id} onClick={() => setSelectedId(o.id)} style={cardStyle}>
                    <div style={{ fontWeight: 600, fontSize: 17, color: "#111" }}>{o.naam}</div>
                    <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
                      {o.adres || "Geen adres ingevuld"}
                    </div>
                    {(!o.adres || !o.email) && (
                      <div style={{ color: "#c0392b", fontSize: 12, marginTop: 6, fontWeight: 600 }}>
                        ⚠ Factuurgegevens onvolledig
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {selected && (
          <OrganisatieDetail
            organisatie={selected}
            onBack={() => setSelectedId(null)}
            onUpdated={laadOrganisaties}
          />
        )}

        {showNieuw && (
          <OrganisatieModal
            onClose={() => setShowNieuw(false)}
            onOpgeslagen={() => {
              setShowNieuw(false);
              laadOrganisaties();
            }}
          />
        )}
      </div>
    </div>
  );
}

function OrganisatieDetail({ organisatie, onBack, onUpdated }) {
  const [showBewerken, setShowBewerken] = useState(false);

  return (
    <div>
      <button onClick={onBack} style={backBtn}>
        ← Terug naar organisaties
      </button>

      <div style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h2 style={{ margin: 0, fontSize: 24 }}>{organisatie.naam}</h2>
          <button style={secundaireBtn} onClick={() => setShowBewerken(true)}>
            Bewerken
          </button>
        </div>

        <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
          <Veld label="Adres (voor op de factuur)" waarde={organisatie.adres} />
          <Veld label="Contactpersoon" waarde={organisatie.contactpersoon} />
          <Veld label="E-mailadres" waarde={organisatie.email} />
          <Veld label="Notitie" waarde={organisatie.notitie} />
        </div>

        {(!organisatie.adres || !organisatie.email) && (
          <div
            style={{
              marginTop: 20,
              background: "#fee2e2",
              color: "#c0392b",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⚠ Adres en/of e-mailadres ontbreken nog — de factuur wordt zonder deze gegevens afgedrukt.
          </div>
        )}
      </div>

      {showBewerken && (
        <OrganisatieModal
          organisatie={organisatie}
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

function Veld({ label, waarde }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 15, color: waarde ? "#111" : "#bbb", marginTop: 2 }}>{waarde || "Niet ingevuld"}</div>
    </div>
  );
}

function OrganisatieModal({ organisatie, onClose, onOpgeslagen }) {
  const [form, setForm] = useState({
    naam: organisatie?.naam || "",
    adres: organisatie?.adres || "",
    contactpersoon: organisatie?.contactpersoon || "",
    email: organisatie?.email || "",
    notitie: organisatie?.notitie || "",
  });
  const [saving, setSaving] = useState(false);

  async function opslaan() {
    if (!form.naam) return;
    setSaving(true);
    let error;
    if (organisatie) {
      ({ error } = await supabase.from("organisaties").update(form).eq("id", organisatie.id));
    } else {
      ({ error } = await supabase.from("organisaties").insert([form]));
    }
    setSaving(false);
    if (!error) onOpgeslagen();
    else alert("Er ging iets mis: " + error.message);
  }

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
        style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 24, width: 420, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{organisatie ? "Organisatie bewerken" : "Nieuwe organisatie"}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>
            ×
          </button>
        </div>

        <Field label="Naam *">
          <input style={inputStyle} value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
        </Field>
        <Field label="Adres (voor op de factuur)">
          <textarea
            style={{ ...inputStyle, minHeight: 60 }}
            placeholder="Straatnaam 1, 1234 AB Plaats"
            value={form.adres}
            onChange={(e) => setForm({ ...form, adres: e.target.value })}
          />
        </Field>
        <Field label="Contactpersoon">
          <input
            style={inputStyle}
            value={form.contactpersoon}
            onChange={(e) => setForm({ ...form, contactpersoon: e.target.value })}
          />
        </Field>
        <Field label="E-mailadres (voor facturen)">
          <input style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Notitie">
          <textarea
            style={{ ...inputStyle, minHeight: 60 }}
            value={form.notitie}
            onChange={(e) => setForm({ ...form, notitie: e.target.value })}
          />
        </Field>

        <button style={{ ...primaryBtn, width: "100%", marginTop: 8 }} onClick={opslaan} disabled={saving}>
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
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

const cardStyle = { background: "#fff", borderRadius: 14, padding: 18, cursor: "pointer" };
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
