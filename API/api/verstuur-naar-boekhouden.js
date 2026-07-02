// api/verstuur-naar-eboekhouden.js
//
// Beveiligde server-functie (draait op Vercel, niet in de browser).
// Ontvangt een factuur-ID, haalt de factuurgegevens op uit Supabase,
// en stuurt de factuur door naar e-Boekhouden.nl via hun REST API.
//
// Vereiste environment variables in Vercel (GEEN VITE_ prefix — server-only):
//   EBOEKHOUDEN_API_TOKEN     - je API-token uit e-Boekhouden.nl
//   SUPABASE_URL              - zelfde als VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY - Service Role key uit Supabase (Project Settings > API)
//
// LET OP: de Service Role key omzeilt Row Level Security. Deel deze nooit
// en zet 'm nooit in een VITE_-variabele (die komt wel in de browser terecht).

import { createClient } from "@supabase/supabase-js";

const EBOEKHOUDEN_BASIS_URL = "https://api.e-boekhouden.nl/v1";

// ---- Standaardwaarden voor de boekingsregel ----
// Controleer deze in je eigen e-Boekhouden-administratie en pas aan indien nodig.
const STANDAARD_GROOTBOEK_ID = Number(process.env.EBOEKHOUDEN_LEDGER_ID || 8000); // "Omzet diensten hoog" o.i.d.
const STANDAARD_BTW_CODE = process.env.EBOEKHOUDEN_VAT_CODE || "HOOG_VERK_21";
const STANDAARD_TEMPLATE_ID = Number(process.env.EBOEKHOUDEN_TEMPLATE_ID || 0); // 0 = standaard sjabloon

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Alleen POST toegestaan" });
  }

  const { invoiceId } = req.body || {};
  if (!invoiceId) {
    return res.status(400).json({ error: "invoiceId ontbreekt" });
  }

  const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Factuur + organisatie + sessieregels ophalen
    const { data: factuur, error: factuurError } = await supabaseAdmin
      .from("invoices")
      .select("*, organisaties(*)")
      .eq("id", invoiceId)
      .single();

    if (factuurError || !factuur) {
      return res.status(404).json({ error: "Factuur niet gevonden: " + (factuurError?.message || "") });
    }

    if (factuur.eboekhouden_verstuurd) {
      return res.status(400).json({ error: "Deze factuur is al eerder verstuurd naar e-Boekhouden." });
    }

    const organisatie = factuur.organisaties;
    if (!organisatie) {
      return res.status(400).json({ error: "Geen organisatie gekoppeld aan deze factuur." });
    }

    const { data: sessies } = await supabaseAdmin
      .from("session_bedragen")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("datum", { ascending: true });

    // 2. Inloggen bij e-Boekhouden (sessie starten)
    const sessieResponse = await fetch(`${EBOEKHOUDEN_BASIS_URL}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken: process.env.EBOEKHOUDEN_API_TOKEN,
        source: "OYMB",
      }),
    });

    if (!sessieResponse.ok) {
      const tekst = await sessieResponse.text();
      return res.status(502).json({ error: "Kon niet inloggen bij e-Boekhouden: " + tekst });
    }
    const { token: sessieToken } = await sessieResponse.json();

    const ebHeaders = {
      "Content-Type": "application/json",
      Authorization: sessieToken,
    };

    // 3. Relatie (organisatie) opzoeken of aanmaken in e-Boekhouden
    let relatieId = organisatie.eboekhouden_relatie_id;

    if (!relatieId) {
      const relatieResponse = await fetch(`${EBOEKHOUDEN_BASIS_URL}/relation`, {
        method: "POST",
        headers: ebHeaders,
        body: JSON.stringify({
          companyName: organisatie.naam,
          address: organisatie.adres || "",
          contactPerson: organisatie.contactpersoon || "",
          email: organisatie.email || "",
        }),
      });

      if (!relatieResponse.ok) {
        const tekst = await relatieResponse.text();
        return res.status(502).json({ error: "Kon relatie niet aanmaken in e-Boekhouden: " + tekst });
      }
      const nieuweRelatie = await relatieResponse.json();
      relatieId = nieuweRelatie.id;

      // Bewaar het relatie-ID zodat we het de volgende keer hergebruiken
      await supabaseAdmin.from("organisaties").update({ eboekhouden_relatie_id: relatieId }).eq("id", organisatie.id);
    }

    // 4. Factuurregels opbouwen — sessie-uren, reistijd en km apart, met cliëntnaam in de omschrijving
    const items = [];
    (sessies || []).forEach((s) => {
      const sessieUren = s.duur_minuten / 60;
      const reisUren = (s.reistijd_minuten || 0) / 60;
      const uurtarief = s.uurtarief || 85;
      const kmTarief = s.km_tarief || 0.23;
      const datumLabel = new Date(s.datum).toLocaleDateString("nl-NL");

      items.push({
        description: `${s.client_naam} — Begeleidingssessie (${datumLabel})`,
        pricePerUnit: uurtarief,
        quantity: Number(sessieUren.toFixed(2)),
        vatCode: STANDAARD_BTW_CODE,
        ledgerId: STANDAARD_GROOTBOEK_ID,
      });

      if (reisUren > 0) {
        items.push({
          description: `${s.client_naam} — Reistijd (${datumLabel})`,
          pricePerUnit: uurtarief,
          quantity: Number(reisUren.toFixed(2)),
          vatCode: STANDAARD_BTW_CODE,
          ledgerId: STANDAARD_GROOTBOEK_ID,
        });
      }

      if (s.kilometers > 0) {
        items.push({
          description: `${s.client_naam} — Kilometervergoeding (${datumLabel})`,
          pricePerUnit: kmTarief,
          quantity: Number(s.kilometers),
          vatCode: STANDAARD_BTW_CODE,
          ledgerId: STANDAARD_GROOTBOEK_ID,
        });
      }
    });

    // 5. Factuur aanmaken in e-Boekhouden
    const factuurResponse = await fetch(`${EBOEKHOUDEN_BASIS_URL}/invoice`, {
      method: "POST",
      headers: ebHeaders,
      body: JSON.stringify({
        relationId: relatieId,
        templateId: STANDAARD_TEMPLATE_ID,
        invoiceNumber: factuur.factuurnummer,
        date: factuur.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        termOfPayment: 14,
        items,
      }),
    });

    if (!factuurResponse.ok) {
      const tekst = await factuurResponse.text();
      return res.status(502).json({ error: "Kon factuur niet aanmaken in e-Boekhouden: " + tekst });
    }
    const ebFactuur = await factuurResponse.json();

    // 6. Sessie afsluiten bij e-Boekhouden
    await fetch(`${EBOEKHOUDEN_BASIS_URL}/session`, { method: "DELETE", headers: ebHeaders }).catch(() => {});

    // 7. Bijwerken in Supabase: markeer als verstuurd
    await supabaseAdmin
      .from("invoices")
      .update({
        eboekhouden_verstuurd: true,
        eboekhouden_factuur_id: ebFactuur.id || null,
        eboekhouden_verstuurd_op: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    return res.status(200).json({ success: true, eboekhoudenFactuurId: ebFactuur.id });
  } catch (err) {
    return res.status(500).json({ error: "Onverwachte fout: " + err.message });
  }
}
