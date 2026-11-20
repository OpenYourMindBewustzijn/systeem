// api/dagelijkse-taken.js
//
// Wordt elke ochtend automatisch aangeroepen door Vercel (zie vercel.json).
// Doet twee dingen:
//  1. Stuurt afspraakherinneringen per e-mail naar klanten met een afspraak
//     binnen de komende ~26 uur (en markeert die zodat er nooit dubbel gemaild wordt)
//  2. Stuurt jou (info@oymb.nl) een berichtje als een klant vandaag jarig is,
//     zodat jij zelf een persoonlijk bericht kunt sturen
//
// Gebruikt bestaande environment variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, AFSPRAAK_VAN_EMAIL

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  // Vercel stuurt bij cron-aanroepen automatisch "Authorization: Bearer <CRON_SECRET>" mee als die variabele is ingesteld
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Niet toegestaan" });
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const vanAdres = process.env.AFSPRAAK_VAN_EMAIL || "OYMB Bewustzijn <onboarding@resend.dev>";
  const resultaat = { herinneringen: 0, verjaardagen: 0, fouten: [] };

  async function verstuurMail(naar, onderwerp, html) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: vanAdres, to: [naar], subject: onderwerp, html }),
    });
    if (!r.ok) throw new Error(await r.text());
  }

  // ---------- 1. Afspraakherinneringen ----------
  try {
    const nu = new Date();
    const grens = new Date(nu.getTime() + 26 * 60 * 60 * 1000); // komende 26 uur

    const { data: afspraken } = await supabase
      .from("afspraken")
      .select("id, datum_tijd, clients(naam, email, werkruimte_id, toegewezen_aan, werkruimtes(bedrijfsnaam, adres))")
      .eq("status", "gepland")
      .is("herinnering_verstuurd_op", null)
      .gte("datum_tijd", nu.toISOString())
      .lte("datum_tijd", grens.toISOString());

    for (const a of afspraken || []) {
      const klant = a.clients;
      if (!klant?.email) continue;
      const bedrijf = klant.werkruimtes?.bedrijfsnaam || "ons";
      const adres = klant.werkruimtes?.adres || "";

      const start = new Date(a.datum_tijd);
      const datumLabel = start.toLocaleDateString("nl-NL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "Europe/Amsterdam",
      });
      const tijdLabel = start.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Amsterdam",
      });

      const html = `
        <div style="font-family: system-ui, sans-serif; color: #111; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #F984E5;">Herinnering aan je afspraak</h2>
          <p>Beste ${klant.naam},</p>
          <p>Een vriendelijke herinnering: je afspraak bij ${bedrijf} staat gepland op:</p>
          <p style="font-size: 18px; font-weight: 600;">${datumLabel} om ${tijdLabel} uur</p>
          <p>Mocht je onverhoopt verhinderd zijn, laat het dan tijdig even weten.</p>
          <p>Tot dan!</p>
          <p style="color: #999; font-size: 13px; margin-top: 24px;">${bedrijf}${adres ? " · " + adres : ""}</p>
        </div>
      `;

      try {
        await verstuurMail(klant.email, `Herinnering: afspraak ${datumLabel}`, html);
        await supabase
          .from("afspraken")
          .update({ herinnering_verstuurd_op: new Date().toISOString() })
          .eq("id", a.id);
        resultaat.herinneringen++;
      } catch (e) {
        resultaat.fouten.push(`Herinnering ${klant.naam}: ${e.message}`);
      }
    }
  } catch (e) {
    resultaat.fouten.push("Herinneringen: " + e.message);
  }

  // ---------- 2. Verjaardagen ----------
  // Elke jarige gaat alleen naar de persoon aan wie de klant is toegewezen (dus nooit naar iemand anders).
  try {
    const { data: klanten } = await supabase
      .from("clients")
      .select("naam, geboortedatum, telefoon, email, owner_id, toegewezen_aan")
      .not("geboortedatum", "is", null);

    const vandaag = new Date().toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", timeZone: "Europe/Amsterdam" });

    const jarigen = (klanten || []).filter((k) => {
      const gd = new Date(k.geboortedatum);
      const gdLabel = `${String(gd.getDate()).padStart(2, "0")}-${String(gd.getMonth() + 1).padStart(2, "0")}`;
      return gdLabel === vandaag;
    });

    const perPersoon = {};
    jarigen.forEach((k) => {
      const wie = k.toegewezen_aan || k.owner_id;
      if (!wie) return;
      (perPersoon[wie] = perPersoon[wie] || []).push(k);
    });

    for (const [userId, lijstKlanten] of Object.entries(perPersoon)) {
      // Adres van de ontvanger: e-mail van zijn eigen administratie, anders zijn inlogadres
      const { data: leden } = await supabase.from("werkruimte_leden").select("werkruimte_id").eq("user_id", userId);
      let naar = null;
      for (const l of leden || []) {
        const { count } = await supabase.from("werkruimte_leden").select("user_id", { count: "exact", head: true }).eq("werkruimte_id", l.werkruimte_id);
        if (count === 1) {
          const { data: w } = await supabase.from("werkruimtes").select("email").eq("id", l.werkruimte_id).single();
          if (w?.email) { naar = w.email; break; }
        }
      }
      if (!naar) {
        const { data: u } = await supabase.auth.admin.getUserById(userId);
        naar = u?.user?.email || null;
      }
      if (!naar) continue;

      const lijst = lijstKlanten
        .map((k) => `<li><strong>${k.naam}</strong>${k.telefoon ? ` · ${k.telefoon}` : ""}${k.email ? ` · ${k.email}` : ""}</li>`)
        .join("");
      const html = `
        <div style="font-family: system-ui, sans-serif; color: #111; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #F984E5;">🎂 Jarige klant${lijstKlanten.length > 1 ? "en" : ""} vandaag</h2>
          <ul>${lijst}</ul>
          <p style="color: #666; font-size: 14px;">Een persoonlijk berichtje doet wonderen. 💕</p>
        </div>
      `;
      try {
        await verstuurMail(naar, `🎂 ${lijstKlanten.length} jarige klant${lijstKlanten.length > 1 ? "en" : ""} vandaag`, html);
        resultaat.verjaardagen += lijstKlanten.length;
      } catch (e) {
        resultaat.fouten.push("Verjaardag mail: " + e.message);
      }
    }
  } catch (e) {
    resultaat.fouten.push("Verjaardagen: " + e.message);
  }

  return res.status(200).json(resultaat);
}
