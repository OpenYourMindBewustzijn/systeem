// api/verstuur-afspraakbevestiging.js
//
// Beveiligde server-functie die een afspraakbevestiging verstuurt via Resend.nl
// (los van Gmail — een eigen verzendadres, bijv. afspraken@oymb.nl).
//
// Vereiste environment variables in Vercel (server-only, GEEN VITE_ prefix):
//   RESEND_API_KEY   - je API-sleutel van resend.com
//   AFSPRAAK_VAN_EMAIL - het verzendadres, bijv. "OYMB Bewustzijn <afspraken@oymb.nl>"
//                        (dit domein moet je eerst verifiëren bij Resend)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Alleen POST toegestaan" });
  }

  const { email, naam, datumTijd, duurMinuten, locatie } = req.body || {};

  if (!email || !naam || !datumTijd) {
    return res.status(400).json({ error: "email, naam en datumTijd zijn verplicht" });
  }

  const start = new Date(datumTijd);
  const datumLabel = start.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const tijdLabel = start.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

  const html = `
    <div style="font-family: system-ui, sans-serif; color: #111; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #F984E5;">Afspraakbevestiging</h2>
      <p>Beste ${naam},</p>
      <p>Je afspraak bij Open Your Mind Bewustzijn staat gepland op:</p>
      <p style="font-size: 18px; font-weight: 600;">${datumLabel} om ${tijdLabel} uur</p>
      ${duurMinuten ? `<p>Duur: ongeveer ${duurMinuten} minuten.</p>` : ""}
      ${locatie ? `<p>Locatie: ${locatie}</p>` : ""}
      <p>Tot dan!</p>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">Open Your Mind Bewustzijn · Pinksterbloem 19, 2631 SC Nootdorp</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.AFSPRAAK_VAN_EMAIL || "OYMB Bewustzijn <onboarding@resend.dev>",
        to: [email],
        subject: `Afspraakbevestiging — ${datumLabel}`,
        html,
      }),
    });

    if (!response.ok) {
      const tekst = await response.text();
      return res.status(502).json({ error: "Versturen via Resend mislukt: " + tekst });
    }

    const result = await response.json();
    return res.status(200).json({ success: true, id: result.id });
  } catch (err) {
    return res.status(500).json({ error: "Onverwachte fout: " + err.message });
  }
}
