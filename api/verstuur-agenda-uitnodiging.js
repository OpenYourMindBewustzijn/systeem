// api/verstuur-agenda-uitnodiging.js
// Stuurt een agenda-uitnodiging (.ics) naar alle leden van de administratie, zodat de afspraak
// met één klik in ieders eigen (Google) agenda staat.
import { maakAdmin, haalGebruiker, isLid, ledenEmails, maakIcs, verstuurResend, esc, datumLabel, tijdLabel } from "./_hulp.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Alleen POST toegestaan" });
  const admin = maakAdmin();
  const gebruiker = await haalGebruiker(req, admin);
  if (!gebruiker) return res.status(401).json({ error: "Niet ingelogd" });

  const { agendaId } = req.body || {};
  if (!agendaId) return res.status(400).json({ error: "agendaId ontbreekt" });

  try {
    const { data: item } = await admin.from("agenda_items").select("*, werkruimtes(naam, bedrijfsnaam)").eq("id", agendaId).single();
    if (!item || !(await isLid(admin, item.werkruimte_id, gebruiker.id))) {
      return res.status(403).json({ error: "Geen toegang tot deze afspraak" });
    }
    const mails = await ledenEmails(admin, item.werkruimte_id);
    if (mails.length === 0) return res.status(400).json({ error: "Geen e-mailadressen gevonden" });

    const ics = maakIcs({
      uid: item.id, titel: item.titel, start: item.start_op, eind: item.eind_op,
      locatie: item.locatie, omschrijving: item.omschrijving, organisatorMail: gebruiker.email, deelnemers: mails,
    });
    const html = `
      <div style="font-family: system-ui, sans-serif; color: #111; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #F984E5;">${esc(item.titel)}</h2>
        <p style="font-size: 18px; font-weight: 600;">${esc(datumLabel(item.start_op))}<br>${esc(tijdLabel(item.start_op))} – ${esc(tijdLabel(item.eind_op))} uur</p>
        ${item.locatie ? `<p>Locatie: ${esc(item.locatie)}</p>` : ""}
        ${item.omschrijving ? `<p>${esc(item.omschrijving)}</p>` : ""}
        <p style="color:#666;font-size:14px;">Open de bijlage (afspraak.ics) om dit in je agenda te zetten.</p>
        <p style="color: #999; font-size: 13px;">${esc(item.werkruimtes?.naam || "")}</p>
      </div>`;
    await verstuurResend({ to: mails, subject: `Agenda: ${item.titel} — ${datumLabel(item.start_op)}`, html, ics });
    await admin.from("agenda_items").update({ uitnodiging_verstuurd_op: new Date().toISOString() }).eq("id", item.id);
    return res.status(200).json({ success: true, verstuurdNaar: mails.length });
  } catch (e) {
    return res.status(500).json({ error: "Versturen mislukt: " + e.message });
  }
}
