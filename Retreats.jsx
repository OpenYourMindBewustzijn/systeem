import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useWerkruimte } from "./WerkruimteContext";
import { genereerFactuurPDF } from "./factuurPdf";
import { volgendFactuurnummer } from "./facturatie";

const PINK = "#F984E5";
const euro = (n) => (Number(n) || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const fmtD = (d) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
const rond = (n) => Math.round(n * 100) / 100;

const STATUSSEN = [
  ["geinteresseerd", "Geïnteresseerd"],
  ["aangemeld", "Aangemeld"],
  ["bevestigd", "Bevestigd"],
  ["afgehaakt", "Afgehaakt"],
];
const statusLabel = (s) => STATUSSEN.find((x) => x[0] === s)?.[1] || s;

export default function Retreats() {
  const { isGedeeld } = useWerkruimte();
  const [gekozen, setGekozen] = useState(null);
  if (!isGedeeld) return <div style={{ color: "#999", padding: 40 }}>Retreats zijn er alleen in een gedeelde administratie.</div>;
  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "32px 20px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        {gekozen ? <Detail retreatId={gekozen} terug={() => setGekozen(null)} /> : <Overzicht open={setGekozen} />}
      </div>
    </div>
  );
}

// ---------- Overzicht van alle retreats ----------
function Overzicht({ open }) {
  const { actief } = useWerkruimte();
  const [retreats, setRetreats] = useState([]);
  const [tellingen, setTellingen] = useState({});
  const [nieuw, setNieuw] = useState(false);

  async function laad() {
    const [{ data: r }, { data: d }] = await Promise.all([
      supabase.from("retreats").select("*").eq("werkruimte_id", actief.id).order("start_datum", { ascending: true }),
      supabase.from("retreat_deelnemers").select("retreat_id, status").eq("werkruimte_id", actief.id),
    ]);
    setRetreats(r || []);
    const t = {};
    (d || []).forEach((x) => { t[x.retreat_id] = t[x.retreat_id] || {}; t[x.retreat_id][x.status] = (t[x.retreat_id][x.status] || 0) + 1; });
    setTellingen(t);
  }
  useEffect(() => { laad(); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Retreats</h1>
        <button style={knop} onClick={() => setNieuw(true)}>+ Nieuwe retreat</button>
      </div>
      <p style={{ color: "#999", fontSize: 14 }}>Retreats en one day retreats van Soulful Selflove, met geïnteresseerden en deelnemers.</p>
      {retreats.length === 0 && <p style={{ color: "#999" }}>Nog geen retreats. Maak de eerste aan.</p>}
      <div style={{ display: "grid", gap: 12 }}>
        {retreats.map((r) => {
          const t = tellingen[r.id] || {};
          const bezet = (t.aangemeld || 0) + (t.bevestigd || 0);
          return (
            <div key={r.id} onClick={() => open(r.id)} style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 18, cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{r.naam}</div>
                  <div style={{ color: "#666", fontSize: 13 }}>
                    {r.soort === "one_day" ? "One day retreat" : "Retreat"} · {fmtD(r.start_datum)}{r.eind_datum !== r.start_datum ? ` t/m ${fmtD(r.eind_datum)}` : ""}
                    {r.locatie ? ` · ${r.locatie}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "#f3f4f6", fontWeight: 600, height: "fit-content" }}>{r.status}</span>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 13, color: "#444", flexWrap: "wrap" }}>
                <span>👀 {t.geinteresseerd || 0} geïnteresseerd</span>
                <span>✅ {bezet}{r.max_deelnemers ? ` / ${r.max_deelnemers}` : ""} deelnemers</span>
                <span>{euro(r.prijs_per_persoon)} p.p.</span>
              </div>
            </div>
          );
        })}
      </div>
      {nieuw && <RetreatForm onClose={() => setNieuw(false)} onOpgeslagen={() => { setNieuw(false); laad(); }} />}
    </div>
  );
}

// ---------- Formulier retreat (nieuw of bewerken) ----------
function RetreatForm({ retreat, onClose, onOpgeslagen }) {
  const { actief, ledenActief, ikId } = useWerkruimte();
  const [f, setF] = useState({
    naam: retreat?.naam || "", soort: retreat?.soort || "retreat",
    start_datum: retreat?.start_datum || "", eind_datum: retreat?.eind_datum || "",
    tijden: retreat?.tijden || "", locatie: retreat?.locatie || "",
    prijs_per_persoon: retreat?.prijs_per_persoon ?? "", btw_percentage: retreat?.btw_percentage ?? 0,
    max_deelnemers: retreat?.max_deelnemers ?? "", factureren_door: retreat?.factureren_door || ikId,
    status: retreat?.status || "open", omschrijving: retreat?.omschrijving || "",
  });
  const [fout, setFout] = useState("");
  const zet = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function opslaan() {
    setFout("");
    if (!f.naam.trim() || !f.start_datum) { setFout("Vul een naam en startdatum in."); return; }
    const payload = {
      naam: f.naam.trim(), soort: f.soort, start_datum: f.start_datum, eind_datum: f.eind_datum || f.start_datum,
      tijden: f.tijden || null, locatie: f.locatie || null,
      prijs_per_persoon: Number(f.prijs_per_persoon) || 0, btw_percentage: Number(f.btw_percentage) || 0,
      max_deelnemers: f.max_deelnemers ? Number(f.max_deelnemers) : null,
      factureren_door: f.factureren_door || null, status: f.status, omschrijving: f.omschrijving || null,
    };
    const { error } = retreat
      ? await supabase.from("retreats").update(payload).eq("id", retreat.id)
      : await supabase.from("retreats").insert([{ ...payload, werkruimte_id: actief.id }]);
    if (error) setFout(error.message); else onOpgeslagen();
  }

  return (
    <Modal titel={retreat ? "Retreat bewerken" : "Nieuwe retreat"} onClose={onClose}>
      <Veld l="Naam"><input style={inp} value={f.naam} onChange={(e) => zet("naam", e.target.value)} placeholder="bijv. Ardennen retreat" /></Veld>
      <Veld l="Soort">
        <select style={inp} value={f.soort} onChange={(e) => zet("soort", e.target.value)}>
          <option value="retreat">Retreat (meerdere dagen)</option>
          <option value="one_day">One day retreat</option>
        </select>
      </Veld>
      <div style={rij}>
        <Veld l="Van"><input style={inp} type="date" value={f.start_datum} onChange={(e) => zet("start_datum", e.target.value)} /></Veld>
        <Veld l="Tot en met"><input style={inp} type="date" value={f.eind_datum} onChange={(e) => zet("eind_datum", e.target.value)} /></Veld>
      </div>
      <Veld l="Tijden (optioneel)"><input style={inp} value={f.tijden} onChange={(e) => zet("tijden", e.target.value)} placeholder="bijv. 12:00 – 16:00" /></Veld>
      <Veld l="Locatie"><input style={inp} value={f.locatie} onChange={(e) => zet("locatie", e.target.value)} /></Veld>
      <div style={rij}>
        <Veld l="Prijs per persoon (wat de deelnemer betaalt)"><input style={inp} type="number" step="0.01" value={f.prijs_per_persoon} onChange={(e) => zet("prijs_per_persoon", e.target.value)} /></Veld>
        <Veld l="Btw hierin (%) — 0 = geen btw"><input style={inp} type="number" step="0.01" value={f.btw_percentage} onChange={(e) => zet("btw_percentage", e.target.value)} /></Veld>
      </div>
      <div style={rij}>
        <Veld l="Maximaal aantal deelnemers"><input style={inp} type="number" value={f.max_deelnemers} onChange={(e) => zet("max_deelnemers", e.target.value)} /></Veld>
        <Veld l="Facturen op naam van">
          <select style={inp} value={f.factureren_door || ""} onChange={(e) => zet("factureren_door", e.target.value)}>
            {ledenActief.map((l) => <option key={l.user_id} value={l.user_id}>{l.weergavenaam}</option>)}
          </select>
        </Veld>
      </div>
      <Veld l="Status">
        <select style={inp} value={f.status} onChange={(e) => zet("status", e.target.value)}>
          <option value="open">open</option><option value="vol">vol</option><option value="afgerond">afgerond</option><option value="geannuleerd">geannuleerd</option>
        </select>
      </Veld>
      <Veld l="Omschrijving / notities"><textarea style={{ ...inp, minHeight: 70 }} value={f.omschrijving} onChange={(e) => zet("omschrijving", e.target.value)} /></Veld>
      {fout && <div style={{ color: "#c0392b", fontSize: 13 }}>{fout}</div>}
      <button style={knop} onClick={opslaan}>Opslaan</button>
    </Modal>
  );
}

// ---------- Detail van een retreat: deelnemers, intake, facturen ----------
function Detail({ retreatId, terug }) {
  const { ledenActief, naamVan, ikId } = useWerkruimte();
  const [retreat, setRetreat] = useState(null);
  const [deelnemers, setDeelnemers] = useState([]);
  const [facturen, setFacturen] = useState({});
  const [filter, setFilter] = useState("alle");
  const [bewerkRetreat, setBewerkRetreat] = useState(false);
  const [deelnemerForm, setDeelnemerForm] = useState(null); // null | "nieuw" | deelnemer
  const [bezig, setBezig] = useState("");

  async function laad() {
    const [{ data: r }, { data: d }] = await Promise.all([
      supabase.from("retreats").select("*").eq("id", retreatId).single(),
      supabase.from("retreat_deelnemers").select("*").eq("retreat_id", retreatId).order("aangemaakt_op", { ascending: true }),
    ]);
    setRetreat(r);
    setDeelnemers(d || []);
    const ids = (d || []).map((x) => x.id);
    if (ids.length) {
      const { data: inv } = await supabase.from("invoices").select("id, factuurnummer, status, deelnemer_id, credit_van_factuur_id").in("deelnemer_id", ids);
      const m = {};
      (inv || []).filter((i) => !i.credit_van_factuur_id && i.status !== "gecrediteerd").forEach((i) => (m[i.deelnemer_id] = i));
      setFacturen(m);
    } else setFacturen({});
  }
  useEffect(() => { laad(); }, [retreatId]);

  if (!retreat) return <p style={{ color: "#999" }}>Laden...</p>;

  const telling = (s) => deelnemers.filter((d) => d.status === s).length;
  const bezet = telling("aangemeld") + telling("bevestigd");
  const zichtbaar = deelnemers.filter((d) => filter === "alle" || d.status === filter);
  const prijsVan = (d) => (d.prijs_afwijkend ?? retreat.prijs_per_persoon);
  const verwacht = deelnemers.filter((d) => ["aangemeld", "bevestigd"].includes(d.status)).reduce((s, d) => s + Number(prijsVan(d)), 0);

  async function wijzigStatus(d, status) {
    await supabase.from("retreat_deelnemers").update({ status }).eq("id", d.id);
    laad();
  }
  async function verwijder(d) {
    if (!confirm(`${d.naam} verwijderen uit deze retreat? Een bestaande factuur blijft staan.`)) return;
    await supabase.from("retreat_deelnemers").delete().eq("id", d.id);
    laad();
  }
  async function verwijderRetreat() {
    if (deelnemers.length > 0) { alert("Verwijder eerst alle deelnemers, of zet de status op 'geannuleerd'."); return; }
    if (!confirm("Deze retreat verwijderen?")) return;
    await supabase.from("retreats").delete().eq("id", retreat.id);
    terug();
  }

  async function maakFactuur(d) {
    if (facturen[d.id]) { alert(`Er is al een factuur voor ${d.naam}: ${facturen[d.id].factuurnummer}.`); return; }
    const prijs = Number(prijsVan(d));
    if (!(prijs > 0)) { alert("Vul eerst een prijs in (bij de retreat of bij de deelnemer)."); return; }
    if (!confirm(`Factuur van ${euro(prijs)} maken voor ${d.naam}?`)) return;
    setBezig(d.id);
    try {
      const { data: uitgever, error: ue } = await supabase.rpc("factuur_uitgever_deelnemer", { p_deelnemer: d.id });
      if (ue) throw new Error(ue.message);
      const nummer = await volgendFactuurnummer(uitgever.werkruimte_id);
      const perc = Number(retreat.btw_percentage) || 0;
      const subtotaal = rond(prijs / (1 + perc / 100));
      const btw = rond(prijs - subtotaal);
      const omschrijving = retreat.naam + (d.opties ? ` + ${d.opties}` : "");
      const { data: factuur, error } = await supabase.from("invoices").insert([{
        werkruimte_id: retreat.werkruimte_id, uitgever, uitgever_werkruimte_id: uitgever.werkruimte_id,
        factuurnummer: nummer, periode_start: retreat.start_datum, periode_eind: retreat.eind_datum,
        subtotaal, btw_bedrag: btw, totaal: prijs, status: "concept", deelnemer_id: d.id,
        klant: { naam: d.naam, adres: d.adres || null, email: d.email || null },
        regels: [{ omschrijving, aantal: "1", bedrag: subtotaal }],
      }]).select().single();
      if (error) throw new Error(error.message);
      genereerFactuurPDF(factuur, factuur.klant, []);
      laad();
    } catch (e) {
      alert("Factuur maken niet gelukt: " + e.message);
    }
    setBezig("");
  }

  async function downloadFactuur(d) {
    const { data: f } = await supabase.from("invoices").select("*").eq("id", facturen[d.id].id).single();
    genereerFactuurPDF(f, f.klant, []);
  }

  function exportCSV() {
    const kol = ["Naam", "Status", "E-mail", "Telefoon", "Hulpvraag", "Verwachtingen", "Bijzonderheden", "Dieet", "Noodcontact", "Noodcontact tel.", "Opties", "Prijs", "Factuur", "Intake klaar"];
    const rijen = deelnemers.map((d) => [d.naam, statusLabel(d.status), d.email, d.telefoon, d.hulpvraag, d.verwachtingen, d.bijzonderheden, d.dieet, d.noodcontact_naam, d.noodcontact_telefoon, d.opties, String(prijsVan(d)).replace(".", ","), facturen[d.id]?.factuurnummer || "", d.intake_afgerond ? "ja" : "nee"]);
    const csv = [kol, ...rijen].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `deelnemers-${retreat.naam.replace(/\s+/g, "-")}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <button onClick={terug} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", padding: 0, marginBottom: 12 }}>← Alle retreats</button>
      <div style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ margin: 0 }}>{retreat.naam}</h2>
            <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              {fmtD(retreat.start_datum)}{retreat.eind_datum !== retreat.start_datum ? ` t/m ${fmtD(retreat.eind_datum)}` : ""}
              {retreat.tijden ? ` · ${retreat.tijden}` : ""}{retreat.locatie ? ` · ${retreat.locatie}` : ""}
            </div>
            <div style={{ color: "#666", fontSize: 13 }}>
              {euro(retreat.prijs_per_persoon)} p.p. ({Number(retreat.btw_percentage) ? `incl. ${retreat.btw_percentage}% btw` : "zonder btw"}) · facturen op naam van {naamVan(retreat.factureren_door) || "—"}
            </div>
            {retreat.omschrijving && <div style={{ color: "#555", fontSize: 13, marginTop: 6 }}>{retreat.omschrijving}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, height: "fit-content" }}>
            <button style={klein} onClick={() => setBewerkRetreat(true)}>Bewerken</button>
            <button style={{ ...klein, color: "#c0392b" }} onClick={verwijderRetreat}>Verwijderen</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 14 }}>
          <Stat l="Geïnteresseerd" v={telling("geinteresseerd")} />
          <Stat l="Deelnemers" v={`${bezet}${retreat.max_deelnemers ? ` / ${retreat.max_deelnemers}` : ""}`} />
          <Stat l="Verwachte omzet" v={euro(verwacht)} />
          <Stat l="Plekken vrij" v={retreat.max_deelnemers ? Math.max(0, retreat.max_deelnemers - bezet) : "—"} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {[["alle", "Alle"], ...STATUSSEN].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600, border: `1px solid ${filter === k ? PINK : "#333"}`, background: filter === k ? PINK : "transparent", color: filter === k ? "#fff" : "#999" }}>
            {l} ({k === "alle" ? deelnemers.length : telling(k)})
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button style={knopKlein} onClick={exportCSV}>Exporteer lijst</button>
        <button style={knop} onClick={() => setDeelnemerForm("nieuw")}>+ Persoon toevoegen</button>
      </div>

      {zichtbaar.length === 0 && <p style={{ color: "#999" }}>Niemand in dit overzicht.</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {zichtbaar.map((d) => {
          const f = facturen[d.id];
          return (
            <div key={d.id} style={{ background: "#fff", color: "#111", borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{d.naam}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{[d.email, d.telefoon].filter(Boolean).join(" · ") || "Geen contactgegevens"}</div>
                  <div style={{ fontSize: 12, color: "#999" }}>Factureren: {naamVan(d.toegewezen_aan)}{d.prijs_afwijkend != null ? ` · afwijkende prijs ${euro(d.prijs_afwijkend)}` : ""}{d.opties ? ` · ${d.opties}` : ""}</div>
                </div>
                <select value={d.status} onChange={(e) => wijzigStatus(d, e.target.value)} style={{ ...inp, width: "auto", padding: "4px 8px", fontSize: 12, fontWeight: 600 }}>
                  {STATUSSEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              {(d.bijzonderheden || d.dieet) && (
                <div style={{ background: "#fff7e6", borderRadius: 8, padding: "8px 10px", marginTop: 8, fontSize: 13 }}>
                  {d.bijzonderheden && <div><strong>Bijzonderheden:</strong> {d.bijzonderheden}</div>}
                  {d.dieet && <div><strong>Dieet / allergie:</strong> {d.dieet}</div>}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 12, color: d.intake_afgerond ? "#166534" : "#b45309", fontWeight: 600 }}>
                  {d.intake_afgerond ? "✓ Intake afgerond" : "Intake nog niet afgerond"}
                </span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {f ? (
                    <button style={klein} onClick={() => downloadFactuur(d)}>Factuur {f.factuurnummer} ({f.status}) · PDF</button>
                  ) : (
                    d.status !== "afgehaakt" && d.status !== "geinteresseerd" && (
                      d.toegewezen_aan === ikId
                        ? <button style={{ ...klein, background: PINK, color: "#fff", border: "none" }} disabled={bezig === d.id} onClick={() => maakFactuur(d)}>{bezig === d.id ? "Bezig..." : "Factuur maken"}</button>
                        : <span style={{ fontSize: 12, color: "#999" }}>Factuur maakt {naamVan(d.toegewezen_aan)}</span>
                    )
                  )}
                  <button style={klein} onClick={() => setDeelnemerForm(d)}>Gegevens &amp; intake</button>
                  <button style={{ ...klein, color: "#c0392b" }} onClick={() => verwijder(d)}>✕</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {bewerkRetreat && <RetreatForm retreat={retreat} onClose={() => setBewerkRetreat(false)} onOpgeslagen={() => { setBewerkRetreat(false); laad(); }} />}
      {deelnemerForm && (
        <DeelnemerForm
          retreat={retreat}
          deelnemer={deelnemerForm === "nieuw" ? null : deelnemerForm}
          leden={ledenActief}
          onClose={() => setDeelnemerForm(null)}
          onOpgeslagen={() => { setDeelnemerForm(null); laad(); }}
        />
      )}
    </div>
  );
}

function DeelnemerForm({ retreat, deelnemer, leden, onClose, onOpgeslagen }) {
  const [f, setF] = useState({
    naam: deelnemer?.naam || "", email: deelnemer?.email || "", telefoon: deelnemer?.telefoon || "", adres: deelnemer?.adres || "",
    status: deelnemer?.status || "geinteresseerd", toegewezen_aan: deelnemer?.toegewezen_aan || retreat.factureren_door || "",
    hulpvraag: deelnemer?.hulpvraag || "", verwachtingen: deelnemer?.verwachtingen || "",
    bijzonderheden: deelnemer?.bijzonderheden || "", dieet: deelnemer?.dieet || "",
    noodcontact_naam: deelnemer?.noodcontact_naam || "", noodcontact_telefoon: deelnemer?.noodcontact_telefoon || "",
    intake_afgerond: deelnemer?.intake_afgerond || false, opties: deelnemer?.opties || "",
    prijs_afwijkend: deelnemer?.prijs_afwijkend ?? "", notities: deelnemer?.notities || "",
  });
  const [fout, setFout] = useState("");
  const zet = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function opslaan() {
    setFout("");
    if (!f.naam.trim()) { setFout("Vul een naam in."); return; }
    const leeg = (v) => (v === "" ? null : v);
    const payload = {
      naam: f.naam.trim(), email: leeg(f.email), telefoon: leeg(f.telefoon), adres: leeg(f.adres), status: f.status,
      toegewezen_aan: leeg(f.toegewezen_aan), hulpvraag: leeg(f.hulpvraag), verwachtingen: leeg(f.verwachtingen),
      bijzonderheden: leeg(f.bijzonderheden), dieet: leeg(f.dieet), noodcontact_naam: leeg(f.noodcontact_naam),
      noodcontact_telefoon: leeg(f.noodcontact_telefoon), intake_afgerond: f.intake_afgerond, opties: leeg(f.opties),
      prijs_afwijkend: f.prijs_afwijkend === "" ? null : Number(f.prijs_afwijkend), notities: leeg(f.notities),
    };
    const { error } = deelnemer
      ? await supabase.from("retreat_deelnemers").update(payload).eq("id", deelnemer.id)
      : await supabase.from("retreat_deelnemers").insert([{ ...payload, retreat_id: retreat.id, werkruimte_id: retreat.werkruimte_id }]);
    if (error) setFout(error.message); else onOpgeslagen();
  }

  return (
    <Modal titel={deelnemer ? deelnemer.naam : "Persoon toevoegen"} onClose={onClose}>
      <h4 style={kop}>Contact</h4>
      <Veld l="Naam"><input style={inp} value={f.naam} onChange={(e) => zet("naam", e.target.value)} /></Veld>
      <div style={rij}>
        <Veld l="E-mail"><input style={inp} value={f.email} onChange={(e) => zet("email", e.target.value)} /></Veld>
        <Veld l="Telefoon"><input style={inp} value={f.telefoon} onChange={(e) => zet("telefoon", e.target.value)} /></Veld>
      </div>
      <Veld l="Adres (voor op de factuur)"><input style={inp} value={f.adres} onChange={(e) => zet("adres", e.target.value)} /></Veld>
      <div style={rij}>
        <Veld l="Status">
          <select style={inp} value={f.status} onChange={(e) => zet("status", e.target.value)}>{STATUSSEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Veld>
        <Veld l="Factureren door">
          <select style={inp} value={f.toegewezen_aan} onChange={(e) => zet("toegewezen_aan", e.target.value)}>{leden.map((l) => <option key={l.user_id} value={l.user_id}>{l.weergavenaam}</option>)}</select>
        </Veld>
      </div>
      <div style={rij}>
        <Veld l="Bijgeboekte opties (komt op de factuur)"><input style={inp} value={f.opties} onChange={(e) => zet("opties", e.target.value)} placeholder="bijv. Access Bars" /></Veld>
        <Veld l="Afwijkende prijs (leeg = standaard)"><input style={inp} type="number" step="0.01" value={f.prijs_afwijkend} onChange={(e) => zet("prijs_afwijkend", e.target.value)} /></Veld>
      </div>

      <h4 style={kop}>Intake &amp; bijzonderheden</h4>
      <Veld l="Hulpvraag"><textarea style={{ ...inp, minHeight: 60 }} value={f.hulpvraag} onChange={(e) => zet("hulpvraag", e.target.value)} /></Veld>
      <Veld l="Verwachtingen van de retreat"><textarea style={{ ...inp, minHeight: 60 }} value={f.verwachtingen} onChange={(e) => zet("verwachtingen", e.target.value)} /></Veld>
      <Veld l="Bijzonderheden (gezondheid, medicatie, waar we rekening mee houden)"><textarea style={{ ...inp, minHeight: 60 }} value={f.bijzonderheden} onChange={(e) => zet("bijzonderheden", e.target.value)} /></Veld>
      <Veld l="Dieet / allergieën"><input style={inp} value={f.dieet} onChange={(e) => zet("dieet", e.target.value)} /></Veld>
      <div style={rij}>
        <Veld l="Noodcontact (naam)"><input style={inp} value={f.noodcontact_naam} onChange={(e) => zet("noodcontact_naam", e.target.value)} /></Veld>
        <Veld l="Noodcontact (telefoon)"><input style={inp} value={f.noodcontact_telefoon} onChange={(e) => zet("noodcontact_telefoon", e.target.value)} /></Veld>
      </div>
      <Veld l="Notities"><textarea style={{ ...inp, minHeight: 50 }} value={f.notities} onChange={(e) => zet("notities", e.target.value)} /></Veld>
      <label style={{ fontSize: 14, display: "block", margin: "8px 0" }}>
        <input type="checkbox" checked={f.intake_afgerond} onChange={(e) => zet("intake_afgerond", e.target.checked)} /> Intake afgerond
      </label>
      <p style={{ fontSize: 12, color: "#888" }}>Deze gegevens zijn alleen zichtbaar voor jou en Karima.</p>
      {fout && <div style={{ color: "#c0392b", fontSize: 13 }}>{fout}</div>}
      <button style={knop} onClick={opslaan}>Opslaan</button>
    </Modal>
  );
}

function Stat({ l, v }) {
  return (
    <div style={{ background: "#faf5ff", borderRadius: 10, padding: 10 }}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase" }}>{l}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
    </div>
  );
}
function Veld({ l, children }) {
  return <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#555", fontWeight: 600, marginBottom: 10 }}>{l}{children}</label>;
}
function Modal({ titel, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflowY: "auto", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", color: "#111", borderRadius: 16, padding: 22, width: "100%", maxWidth: 560, margin: "20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{titel}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inp = { border: "1px solid #ddd", borderRadius: 8, padding: "9px 11px", fontSize: 14, width: "100%", boxSizing: "border-box", fontFamily: "inherit", color: "#111", background: "#fff" };
const rij = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const kop = { margin: "14px 0 8px", fontSize: 14, color: PINK };
const knop = { background: PINK, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer" };
const knopKlein = { background: "#222", color: "#ddd", border: "1px solid #333", borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const klein = { background: "#fff", color: "#333", border: "1px solid #ddd", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
