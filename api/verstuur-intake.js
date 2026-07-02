// api/verstuur-intake.js
//
// Verstuurt een link naar het online intakeformulier per e-mail, via Resend.
// Gebruikt dezelfde Resend-koppeling als de afspraakbevestiging.
//
// Vereiste environment variables (al aanwezig als je de afspraakmail al werkend hebt):
//   RESEND_API_KEY
//   AFSPRAAK_VAN_EMAIL   - hergebruikt als algemeen verzendadres

const INTAKE_URL = "https://intakeformulier-gf82.vercel.app/";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Alleen POST toegestaan" });
  }

  const { email, naam } = req.body || {};
  if (!email || !naam) {
    return res.status(400).json({ error: "email en naam zijn verplicht" });
  }

  const html = `
    <div style="font-family: system-ui, sans-serif; color: #111; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #F984E5;">Intakeformulier</h2>
      <p>Beste ${naam},</p>
      <p>Fijn dat je start bij Open Your Mind Bewustzijn. Voordat we beginnen, vragen we je het onderstaande intakeformulier in te vullen:</p>
      <p style="margin: 24px 0;">
        <a href="${INTAKE_URL}" style="background: #F984E5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Open intakeformulier
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">Of kopieer deze link: ${INTAKE_URL}</p>
      <p>Tot snel!</p>
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
        subject: "Intakeformulier — Open Your Mind Bewustzijn",
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
