import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useWerkruimte } from "./WerkruimteContext";

const PINK = "#F984E5";

const VELDEN = [
  ["bedrijfsnaam", "Bedrijfsnaam (op de factuur)"],
  ["adres", "Adres"],
  ["email", "E-mailadres"],
  ["website", "Website"],
  ["kvk", "KvK-nummer"],
  ["btw_nummer", "BTW-nummer"],
  ["iban", "IBAN"],
];

export default function Instellingen() {
  const { actief, ledenActief, isGedeeld, herlaad, werkruimtes } = useWerkruimte();
  const [form, setForm] = useState(null);
  const [heeftFacturen, setHeeftFacturen] = useState(true);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");

  useEffect(() => {
    if (!actief) return;
    setForm({ ...actief });
    setMelding("");
    // Het voorvoegsel van factuurnummers mag niet meer veranderen zodra er facturen zijn
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("uitgever_werkruimte_id", actief.id)
      .then(({ count }) => setHeeftFacturen((count || 0) > 0));
  }, [actief?.id]);

  if (!form) return null;
  const zet = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function opslaan() {
    setBezig(true);
    setMelding("");
    const payload = {
      bedrijfsnaam: form.bedrijfsnaam, adres: form.adres, email: form.email, website: form.website,
      kvk: form.kvk, btw_nummer: form.btw_nummer, iban: form.iban,
      uurtarief: Number(form.uurtarief), km_tarief: Number(form.km_tarief),
      btw_percentage: Number(form.btw_percentage), betaaltermijn_dagen: Number(form.betaaltermijn_dagen),
    };
    if (!heeftFacturen) payload.factuur_prefix = (form.factuur_prefix || "").trim().toUpperCase();
    const { error } = await supabase.from("werkruimtes").update(payload).eq("id", actief.id);
    setBezig(false);
    if (error) setMelding("Opslaan mislukt: " + error.message);
    else {
      setMelding("Opgeslagen.");
      herlaad();
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "32px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Instellingen · {actief.naam}</h1>
        <p style={{ color: "#999", fontSize: 14 }}>
          {isGedeeld
            ? `Deze administratie is gedeeld met: ${ledenActief.map((l) => l.weergavenaam).join(" en ")}.`
            : "Deze administratie is alleen voor jou. Niemand anders kan hem zien."}
        </p>
        {isGedeeld && (
          <p style={{ color: "#bbb", fontSize: 13, background: "#111", border: "1px solid #333", borderRadius: 10, padding: 12 }}>
            Facturen voor klanten in deze gedeelde administratie komen op de gegevens van de persoon aan wie de klant is
            toegewezen: Wendy → OYMB, Karima → Bureau Sterk Na Geweld. Vul die gegevens in onder de eigen administratie.
            De tarieven hieronder gelden als standaard bij nieuwe sessies.
          </p>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {VELDEN.map(([k, label]) => (
            <label key={k} style={lbl}>
              {label}
              <input style={inp} value={form[k] || ""} onChange={(e) => zet(k, e.target.value)} />
            </label>
          ))}
          <label style={lbl}>
            Voorvoegsel factuurnummer {heeftFacturen && <em style={{ color: "#888" }}>(vast, er zijn al facturen)</em>}
            <input style={inp} value={form.factuur_prefix || ""} disabled={heeftFacturen} onChange={(e) => zet("factuur_prefix", e.target.value)} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={lbl}>Uurtarief (excl. btw)
              <input style={inp} type="number" step="0.01" value={form.uurtarief ?? ""} onChange={(e) => zet("uurtarief", e.target.value)} />
            </label>
            <label style={lbl}>Kilometertarief
              <input style={inp} type="number" step="0.01" value={form.km_tarief ?? ""} onChange={(e) => zet("km_tarief", e.target.value)} />
            </label>
            <label style={lbl}>BTW-percentage
              <input style={inp} type="number" step="0.01" value={form.btw_percentage ?? ""} onChange={(e) => zet("btw_percentage", e.target.value)} />
            </label>
            <label style={lbl}>Betaaltermijn (dagen)
              <input style={inp} type="number" value={form.betaaltermijn_dagen ?? ""} onChange={(e) => zet("betaaltermijn_dagen", e.target.value)} />
            </label>
          </div>
        </div>

        <button onClick={opslaan} disabled={bezig} style={{ marginTop: 20, background: PINK, color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 700, cursor: "pointer" }}>
          {bezig ? "Bezig..." : "Opslaan"}
        </button>
        {melding && <p style={{ color: melding.startsWith("Opgeslagen") ? "#4ade80" : "#f87171" }}>{melding}</p>}
      </div>
    </div>
  );
}

const lbl = { display: "grid", gap: 4, fontSize: 13, color: "#ccc", fontWeight: 600 };
const inp = { background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", fontSize: 14 };
