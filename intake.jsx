import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const PINK = "#F984E5";

// Herkenbare, leesbare labels voor de belangrijkste velden.
// Onbekende velden worden automatisch omgezet (Onderstrepingen -> spaties).
const VELD_LABELS = {
  Naam: "Naam",
  Email_invuller: "E-mailadres",
  Datum: "Datum",
  Hulpvraag: "Hulpvraag",
  Bijzonderheden: "Bijzonderheden",
};

function labelVoor(veld) {
  return VELD_LABELS[veld] || veld.replace(/_/g, " ");
}

export default function Intake() {
  const [intakes, setIntakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [clients, setClients] = useState([]);

  useEffect(() => {
    laadIntakes();
    laadClients();
  }, []);

  async function laadIntakes() {
    setLoading(true);
    const { data } = await supabase
      .from("intake_antwoorden")
      .select("*")
      .order("created_at", { ascending: false });
    setIntakes(data || []);
    setLoading(false);
  }

  async function laadClients() {
    const { data } = await supabase.from("clients").select("id, naam").order("naam", { ascending: true });
    setClients(data || []);
  }

  async function markeerBekeken(id) {
    await supabase.from("intake_antwoorden").update({ status: "bekeken" }).eq("id", id);
    laadIntakes();
  }

  async function koppelAanKlant(intakeId, clientId) {
    await supabase
      .from("intake_antwoorden")
      .update({ client_id: clientId || null, status: clientId ? "gekoppeld" : "bekeken" })
      .eq("id", intakeId);
    laadIntakes();
  }

  const selected = intakes.find((i) => i.id === selectedId);

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "32px 20px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Intake-antwoorden</h1>
          <p style={{ color: "#999", marginTop: 4, fontSize: 14 }}>
            Binnengekomen via het online intakeformulier
          </p>
        </header>

        {!selected && (
          <>
            {loading ? (
              <p style={{ color: "#999" }}>Laden...</p>
            ) : intakes.length === 0 ? (
              <p style={{ color: "#999" }}>Nog geen intakes binnengekomen.</p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {intakes.map((i) => (
                  <div
                    key={i.id}
                    onClick={() => {
                      setSelectedId(i.id);
                      if (i.status === "nieuw") markeerBekeken(i.id);
                    }}
                    style={cardStyle}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 17, color: "#111" }}>
                          {i.naam || "Naam onbekend"}
                        </div>
                        <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>
                          {i.email_invuller || "geen e-mailadres"} ·{" "}
                          {new Date(i.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "3px 10px",
                          borderRadius: 20,
                          background: i.status === "nieuw" ? PINK : i.status === "gekoppeld" ? "#dcfce7" : "#eee",
                          color: i.status === "nieuw" ? "#fff" : i.status === "gekoppeld" ? "#166534" : "#888",
                          fontWeight: 600,
                        }}
                      >
                        {i.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {selected && (
          <div>
            <button onClick={() => setSelectedId(null)} style={backBtn}>
              ← Terug naar overzicht
            </button>

            <div style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>{selected.naam || "Naam onbekend"}</h2>
                  <p style={{ color: "#666", margin: "6px 0 0" }}>{selected.email_invuller}</p>
                  <p style={{ color: "#999", fontSize: 13, margin: "4px 0 0" }}>
                    Ingestuurd op{" "}
                    {new Date(selected.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#999", marginBottom: 4 }}>Koppel aan klant</label>
                  <select
                    style={selectStyle}
                    value={selected.client_id || ""}
                    onChange={(e) => koppelAanKlant(selected.id, e.target.value)}
                  >
                    <option value="">— Niet gekoppeld —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.naam}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {Object.entries(selected.antwoorden || {})
                .filter(([veld]) => !["Naam", "Email_invuller", "_captcha", "_subject", "_template"].includes(veld))
                .map(([veld, waarde]) => (
                  <div key={veld} style={{ ...cardStyle, cursor: "default" }}>
                    <div style={{ fontSize: 12, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                      {labelVoor(veld)}
                    </div>
                    <div style={{ fontSize: 14, color: "#333", whiteSpace: "pre-wrap" }}>
                      {waarde || <span style={{ color: "#bbb" }}>Niet ingevuld</span>}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle = { background: "#fff", borderRadius: 14, padding: 18, cursor: "pointer" };
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
const selectStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #ddd",
  fontSize: 13,
  fontFamily: "inherit",
};
