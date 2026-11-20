import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useWerkruimte } from "./WerkruimteContext";

const PINK = "#F984E5";
const fmt = (d) => new Date(d).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const vandaagISO = () => new Date().toISOString().slice(0, 10);

// Gedeelde pagina voor een administratie met meerdere leden (Soulful Selflove): agenda, to-do lijst, sheets.
export default function Samen() {
  const { isGedeeld } = useWerkruimte();
  const [tab, setTab] = useState("agenda");
  if (!isGedeeld) return <div style={{ color: "#999", padding: 40 }}>Deze pagina is er alleen voor een gedeelde administratie.</div>;
  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", padding: "32px 20px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 16px" }}>Samen</h1>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[["agenda", "Agenda"], ["todo", "To-do"], ["sheets", "Sheets"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "8px 18px", borderRadius: 20, cursor: "pointer", fontWeight: 600, border: `1px solid ${tab === k ? PINK : "#333"}`, background: tab === k ? PINK : "transparent", color: tab === k ? "#fff" : "#999" }}>{l}</button>
          ))}
        </div>
        {tab === "agenda" && <Agenda />}
        {tab === "todo" && <Todo />}
        {tab === "sheets" && <Sheets />}
      </div>
    </div>
  );
}

function Agenda() {
  const { actief, naamVan } = useWerkruimte();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ titel: "", datum: vandaagISO(), van: "10:00", tot: "11:00", locatie: "", omschrijving: "" });
  const [melding, setMelding] = useState("");
  const [bezig, setBezig] = useState(false);

  async function laad() {
    const { data } = await supabase.from("agenda_items").select("*").eq("werkruimte_id", actief.id)
      .gte("eind_op", new Date().toISOString()).order("start_op", { ascending: true });
    setItems(data || []);
  }
  useEffect(() => { laad(); }, []);

  async function uitnodigen(id) {
    const { data: sd } = await supabase.auth.getSession();
    const r = await fetch("/api/verstuur-agenda-uitnodiging", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sd.session?.access_token}` },
      body: JSON.stringify({ agendaId: id }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "onbekende fout");
    return j;
  }

  async function toevoegen() {
    if (!form.titel.trim()) return;
    const start = new Date(`${form.datum}T${form.van}`);
    const eind = new Date(`${form.datum}T${form.tot}`);
    if (!(eind > start)) { setMelding("De eindtijd moet na de begintijd liggen."); return; }
    setBezig(true); setMelding("");
    const { data, error } = await supabase.from("agenda_items").insert([{
      werkruimte_id: actief.id, titel: form.titel.trim(), start_op: start.toISOString(), eind_op: eind.toISOString(),
      locatie: form.locatie || null, omschrijving: form.omschrijving || null,
    }]).select().single();
    if (error) { setMelding("Opslaan mislukt: " + error.message); setBezig(false); return; }
    try {
      const j = await uitnodigen(data.id);
      setMelding(`Opgeslagen. Uitnodiging verstuurd naar ${j.verstuurdNaar} personen.`);
    } catch (e) {
      setMelding("Opgeslagen, maar de uitnodiging is niet verstuurd: " + e.message);
    }
    setForm({ ...form, titel: "", locatie: "", omschrijving: "" });
    setBezig(false);
    laad();
  }

  async function verwijder(id) {
    if (!confirm("Deze afspraak verwijderen? Dit haalt hem niet uit agenda's waar hij al in staat.")) return;
    await supabase.from("agenda_items").delete().eq("id", id);
    laad();
  }

  return (
    <div>
      <div style={kaart}>
        <h3 style={{ margin: "0 0 12px" }}>Nieuwe afspraak voor de ruimte</h3>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={inp} placeholder="Titel (bijv. Vrouwencirkel)" value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <input style={inp} type="date" value={form.datum} onChange={(e) => setForm({ ...form, datum: e.target.value })} />
            <input style={inp} type="time" value={form.van} onChange={(e) => setForm({ ...form, van: e.target.value })} />
            <input style={inp} type="time" value={form.tot} onChange={(e) => setForm({ ...form, tot: e.target.value })} />
          </div>
          <input style={inp} placeholder="Locatie (optioneel)" value={form.locatie} onChange={(e) => setForm({ ...form, locatie: e.target.value })} />
          <textarea style={{ ...inp, minHeight: 60 }} placeholder="Notitie (optioneel)" value={form.omschrijving} onChange={(e) => setForm({ ...form, omschrijving: e.target.value })} />
          <button style={knop} onClick={toevoegen} disabled={bezig}>{bezig ? "Bezig..." : "Opslaan en uitnodiging naar beiden mailen"}</button>
          {melding && <div style={{ fontSize: 13, color: melding.startsWith("Opgeslagen.") ? "#4ade80" : "#fbbf24" }}>{melding}</div>}
        </div>
        <p style={{ color: "#888", fontSize: 12, marginBottom: 0 }}>Jullie allebei krijgen een mail met een agenda-bijlage. Openen en bevestigen zet de afspraak in je eigen Google Agenda.</p>
      </div>

      <h3>Komende afspraken</h3>
      {items.length === 0 && <p style={{ color: "#999" }}>Nog niets gepland.</p>}
      {items.map((i) => (
        <div key={i.id} style={{ ...kaart, color: "#111", background: "#fff", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700 }}>{i.titel}</div>
            <div style={{ fontSize: 13, color: "#555" }}>{fmt(i.start_op)} – {new Date(i.eind_op).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}{i.locatie ? ` · ${i.locatie}` : ""}</div>
            {i.omschrijving && <div style={{ fontSize: 13, color: "#777", marginTop: 2 }}>{i.omschrijving}</div>}
            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Toegevoegd door {naamVan(i.owner_id)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <button style={klein} onClick={async () => { try { const j = await uitnodigen(i.id); alert(`Uitnodiging opnieuw verstuurd naar ${j.verstuurdNaar} personen.`); } catch (e) { alert("Mislukt: " + e.message); } }}>Opnieuw mailen</button>
            <button style={{ ...klein, color: "#c0392b" }} onClick={() => verwijder(i.id)}>Verwijderen</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Todo() {
  const { actief, ledenActief, naamVan, ikId } = useWerkruimte();
  const [items, setItems] = useState([]);
  const [titel, setTitel] = useState("");
  const [wie, setWie] = useState(ikId);
  const [deadline, setDeadline] = useState("");
  const [toonKlaar, setToonKlaar] = useState(false);

  async function laad() {
    const { data } = await supabase.from("todos").select("*").eq("werkruimte_id", actief.id)
      .order("klaar", { ascending: true }).order("deadline", { ascending: true, nullsFirst: false });
    setItems(data || []);
  }
  useEffect(() => { laad(); }, []);

  async function toevoegen() {
    if (!titel.trim()) return;
    await supabase.from("todos").insert([{ werkruimte_id: actief.id, titel: titel.trim(), toegewezen_aan: wie || null, deadline: deadline || null }]);
    setTitel(""); setDeadline("");
    laad();
  }
  async function zet(i, klaar) {
    await supabase.from("todos").update({ klaar, klaar_op: klaar ? new Date().toISOString() : null }).eq("id", i.id);
    laad();
  }
  async function verwijder(id) {
    if (!confirm("Deze taak verwijderen?")) return;
    await supabase.from("todos").delete().eq("id", id);
    laad();
  }
  const zichtbaar = items.filter((i) => toonKlaar || !i.klaar);

  return (
    <div>
      <div style={kaart}>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={inp} placeholder="Nieuwe taak" value={titel} onChange={(e) => setTitel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && toevoegen()} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select style={inp} value={wie || ""} onChange={(e) => setWie(e.target.value)}>
              <option value="">Niemand specifiek</option>
              {ledenActief.map((l) => <option key={l.user_id} value={l.user_id}>{l.weergavenaam}</option>)}
            </select>
            <input style={inp} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <button style={knop} onClick={toevoegen}>Taak toevoegen</button>
        </div>
      </div>
      <label style={{ color: "#999", fontSize: 13, display: "block", margin: "8px 0 12px" }}>
        <input type="checkbox" checked={toonKlaar} onChange={(e) => setToonKlaar(e.target.checked)} /> Toon ook afgeronde taken
      </label>
      {zichtbaar.length === 0 && <p style={{ color: "#999" }}>Niets te doen. 🎉</p>}
      {zichtbaar.map((i) => {
        const teLaat = !i.klaar && i.deadline && i.deadline < vandaagISO();
        return (
          <div key={i.id} style={{ ...kaart, background: "#fff", color: "#111", display: "flex", alignItems: "center", gap: 12 }}>
            <input type="checkbox" checked={i.klaar} onChange={(e) => zet(i, e.target.checked)} style={{ width: 20, height: 20 }} />
            <div style={{ flex: 1, textDecoration: i.klaar ? "line-through" : "none", opacity: i.klaar ? 0.5 : 1 }}>
              <div style={{ fontWeight: 600 }}>{i.titel}</div>
              <div style={{ fontSize: 12, color: teLaat ? "#c0392b" : "#777" }}>
                {i.toegewezen_aan ? naamVan(i.toegewezen_aan) : "Niemand specifiek"}
                {i.deadline ? ` · uiterlijk ${new Date(i.deadline).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}${teLaat ? " (te laat)" : ""}` : ""}
              </div>
            </div>
            <button style={{ ...klein, color: "#c0392b" }} onClick={() => verwijder(i.id)}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

function Sheets() {
  const { actief } = useWerkruimte();
  const [items, setItems] = useState([]);
  const [titel, setTitel] = useState("");
  const [url, setUrl] = useState("");
  const [fout, setFout] = useState("");

  async function laad() {
    const { data } = await supabase.from("sheet_links").select("*").eq("werkruimte_id", actief.id).order("titel", { ascending: true });
    setItems(data || []);
  }
  useEffect(() => { laad(); }, []);

  async function toevoegen() {
    setFout("");
    if (!titel.trim() || !url.trim()) return;
    if (!/^https:\/\//i.test(url.trim())) { setFout("De link moet beginnen met https://"); return; }
    const { error } = await supabase.from("sheet_links").insert([{ werkruimte_id: actief.id, titel: titel.trim(), url: url.trim() }]);
    if (error) { setFout(error.message); return; }
    setTitel(""); setUrl("");
    laad();
  }
  async function verwijder(id) {
    if (!confirm("Deze link verwijderen? Het bestand zelf blijft bestaan.")) return;
    await supabase.from("sheet_links").delete().eq("id", id);
    laad();
  }

  return (
    <div>
      <div style={kaart}>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={inp} placeholder="Naam (bijv. Begroting retreat)" value={titel} onChange={(e) => setTitel(e.target.value)} />
          <input style={inp} placeholder="Link naar de Google Sheet (https://...)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button style={knop} onClick={toevoegen}>Link toevoegen</button>
          {fout && <div style={{ color: "#f87171", fontSize: 13 }}>{fout}</div>}
        </div>
        <p style={{ color: "#888", fontSize: 12, marginBottom: 0 }}>Zorg dat de sheet in Google is gedeeld met jullie allebei. Het systeem bewaart alleen de link.</p>
      </div>
      {items.length === 0 && <p style={{ color: "#999" }}>Nog geen sheets gekoppeld.</p>}
      {items.map((i) => (
        <div key={i.id} style={{ ...kaart, background: "#fff", color: "#111", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>📊 {i.titel}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={i.url} target="_blank" rel="noopener noreferrer" style={{ ...klein, textDecoration: "none", background: PINK, color: "#fff", border: "none" }}>Openen</a>
            <button style={{ ...klein, color: "#c0392b" }} onClick={() => verwijder(i.id)}>Verwijderen</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const kaart = { background: "#111", border: "1px solid #222", borderRadius: 14, padding: 16, marginBottom: 12 };
const inp = { background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 8, padding: "10px 12px", fontSize: 14, width: "100%", boxSizing: "border-box" };
const knop = { background: PINK, color: "#fff", border: "none", borderRadius: 10, padding: "12px 20px", fontWeight: 700, cursor: "pointer" };
const klein = { background: "#fff", color: "#333", border: "1px solid #ddd", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
