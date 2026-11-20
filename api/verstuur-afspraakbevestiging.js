// api/verstuur-afspraakbevestiging.js
// Stuurt een afspraakbevestiging naar de klant (via Resend). Alleen voor ingelogde gebruikers en alleen
// voor klanten uit hun eigen administratie. Bij een gedeelde administratie (Soulful Selflove)
// gaat de bevestiging ook (cc) naar alle leden, met een agenda-bijlage.
//
// Vereiste environment variables in Vercel: RESEND_API_KEY, AFSPRAAK_VAN_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { maakAdmin, haalGebruiker, isLid, ledenEmails, maakIcs, verstuurResend, esc, datumLabel, tijdLabel } from "./_hulp.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Alleen POST toegestaan" });
  const admin = maakAdmin();
  const gebruiker = await haalGebruiker(req, admin);
  if (!gebruiker) return res.status(401).json({ error: "Niet ingelogd" });

  const { clientId, datumTijd, duurMinuten, locatie } = req.body || {};
  if (!clientId || !datumTijd) return res.status(400).json({ error: "clientId en datumTijd zijn verplicht" });

  try {
    const { data: klant } = await admin.from("clients").select("id, naam, email, werkruimte_id, toegewezen_aan").eq("id", clientId).single();
    if (!klant || !(await isLid(admin, klant.werkruimte_id, gebruiker.id))) {
      return res.status(403).json({ error: "Geen toegang tot deze klant" });
    }
    if (!klant.email) return res.status(400).json({ error: "Deze klant heeft geen e-mailadres" });

    // Naam en adres op de bevestiging: van de administratie van de toegewezen persoon (anders van de klant zelf)
    const { data: leden } = await admin.from("werkruimte_leden").select("user_id").eq("werkruimte_id", klant.werkruimte_id);
    const gedeeld = (leden || []).length > 1;
    let bedrijfRuimteId = klant.werkruimte_id;
    if (gedeeld && klant.toegewezen_aan) {
      const { data: eigen } = await admin.from("werkruimte_leden").select("werkruimte_id").eq("user_id", klant.toegewezen_aan);
      for (const e of eigen || []) {
        const { count } = await admin.from("werkruimte_leden").select("user_id", { count: "exact", head: true }).eq("werkruimte_id", e.werkruimte_id);
        if (count === 1) { bedrijfRuimteId = e.werkruimte_id; break; }
      }
    }
    const { data: bedrijf } = await admin.from("werkruimtes").select("bedrijfsnaam, adres").eq("id", bedrijfRuimteId).single();

    const start = new Date(datumTijd);
    const eind = new Date(start.getTime() + (Number(duurMinuten) || 60) * 60000);
    const cc = gedeeld ? await ledenEmails(admin, klant.werkruimte_id) : [];
    const ics = maakIcs({
      uid: `${klant.id}-${start.getTime()}`, titel: `Afspraak ${bedrijf?.bedrijfsnaam || ""}`.trim(), start, eind,
      locatie, organisatorMail: gebruiker.email, deelnemers: [klant.email, ...cc],
    });

    const html = `
      <div style="font-family: system-ui, sans-serif; color: #111; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #F984E5;">Afspraakbevestiging</h2>
        <p>Beste ${esc(klant.naam)},</p>
        <p>Je afspraak bij ${esc(bedrijf?.bedrijfsnaam || "ons")} staat gepland op:</p>
        <p style="font-size: 18px; font-weight: 600;">${esc(datumLabel(start))} om ${esc(tijdLabel(start))} uur</p>
        ${duurMinuten ? `<p>Duur: ongeveer ${esc(duurMinuten)} minuten.</p>` : ""}
        ${locatie ? `<p>Locatie: ${esc(locatie)}</p>` : ""}
        <p>Tot dan!</p>
        <p style="color: #999; font-size: 13px; margin-top: 24px;">${esc(bedrijf?.bedrijfsnaam || "")}${bedrijf?.adres ? " · " + esc(bedrijf.adres) : ""}</p>
      </div>`;
    const result = await verstuurResend({ to: [klant.email], cc, subject: `Afspraakbevestiging — ${datumLabel(start)}`, html, ics });
    return res.status(200).json({ success: true, id: result.id, kopieNaar: cc.length });
  } catch (e) {
    return res.status(500).json({ error: "Versturen mislukt: " + e.message });
  }
}
