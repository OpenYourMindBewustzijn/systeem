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
      .select("id, datum_tijd, clients(naam, email)")
      .eq("status", "gepland")
      .is("herinnering_verstuurd_op", null)
      .gte("datum_tijd", nu.toISOString())
      .lte("datum_tijd", grens.toISOString());

    for (const a of afspraken || []) {
      const klant = a.clients;
      if (!klant?.email) continue;

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
          <p>Een vriendelijke herinnering: je afspraak bij Open Your Mind Bewustzijn staat gepland op:</p>
          <p style="font-size: 18px; font-weight: 600;">${datumLabel} om ${tijdLabel} uur</p>
          <p>Mocht je onverhoopt verhinderd zijn, laat het dan tijdig even weten.</p>
          <p>Tot dan!</p>
          <p style="color: #999; font-size: 13px; margin-top: 24px;">Open Your Mind Bewustzijn · Pinksterbloem 19, 2631 SC Nootdorp</p>
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
  try {
    const { data: klanten } = await supabase
      .from("clients")
      .select("naam, geboortedatum, telefoon, email")
      .not("geboortedatum", "is", null);

    const vandaag = new Date().toLocaleDateString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Europe/Amsterdam",
    }); // "dd-mm"

    const jarigen = (klanten || []).filter((k) => {
      const gd = new Date(k.geboortedatum);
      const gdLabel = `${String(gd.getDate()).padStart(2, "0")}-${String(gd.getMonth() + 1).padStart(2, "0")}`;
      return gdLabel === vandaag;
    });

    if (jarigen.length > 0) {
      const lijst = jarigen
        .map((k) => `<li><strong>${k.naam}</strong>${k.telefoon ? ` · ${k.telefoon}` : ""}${k.email ? ` · ${k.email}` : ""}</li>`)
        .join("");
      const html = `
        <div style="font-family: system-ui, sans-serif; color: #111; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #F984E5;">🎂 Jarige klant${jarigen.length > 1 ? "en" : ""} vandaag</h2>
          <ul>${lijst}</ul>
          <p style="color: #666; font-size: 14px;">Een persoonlijk berichtje doet wonderen. 💕</p>
        </div>
      `;
      await verstuurMail("info@oymb.nl", `🎂 ${jarigen.length} jarige klant${jarigen.length > 1 ? "en" : ""} vandaag`, html);
      resultaat.verjaardagen = jarigen.length;
    }
  } catch (e) {
    resultaat.fouten.push("Verjaardagen: " + e.message);
  }

  return res.status(200).json(resultaat);
}
