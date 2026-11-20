// Gedeelde hulpfuncties voor de server-functies (begint met _ dus het is zelf geen aanroepbaar adres).
import { createClient } from "@supabase/supabase-js";

export const maakAdmin = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export const esc = (t) =>
  String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Wie vraagt dit? Geeft de ingelogde gebruiker of null.
export async function haalGebruiker(req, admin) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data?.user || null;
}

export async function isLid(admin, werkruimteId, userId) {
  const { data } = await admin.from("werkruimte_leden").select("user_id").eq("werkruimte_id", werkruimteId).eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

// E-mailadressen (inlog) van alle leden van een administratie
export async function ledenEmails(admin, werkruimteId) {
  const { data: leden } = await admin.from("werkruimte_leden").select("user_id").eq("werkruimte_id", werkruimteId);
  const mails = [];
  for (const l of leden || []) {
    const { data } = await admin.auth.admin.getUserById(l.user_id);
    if (data?.user?.email) mails.push(data.user.email);
  }
  return [...new Set(mails)];
}

const icsTijd = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsTekst = (t) => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function maakIcs({ uid, titel, start, eind, locatie, omschrijving, organisatorMail, deelnemers }) {
  const regels = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OYMB//Klantensysteem//NL", "CALSCALE:GREGORIAN", "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}@oymb-systeem`,
    `DTSTAMP:${icsTijd(new Date())}`,
    `DTSTART:${icsTijd(start)}`,
    `DTEND:${icsTijd(eind)}`,
    `SUMMARY:${icsTekst(titel)}`,
    locatie ? `LOCATION:${icsTekst(locatie)}` : null,
    omschrijving ? `DESCRIPTION:${icsTekst(omschrijving)}` : null,
    organisatorMail ? `ORGANIZER:mailto:${organisatorMail}` : null,
    ...(deelnemers || []).map((m) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${m}`),
    "STATUS:CONFIRMED", "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  return regels.join("\r\n");
}

export async function verstuurResend({ to, cc, subject, html, ics }) {
  const body = {
    from: process.env.AFSPRAAK_VAN_EMAIL || "OYMB Bewustzijn <onboarding@resend.dev>",
    to, subject, html,
  };
  if (cc?.length) body.cc = cc;
  if (ics) body.attachments = [{ filename: "afspraak.ics", content: Buffer.from(ics).toString("base64"), content_type: "text/calendar; method=REQUEST" }];
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export const datumLabel = (d) => new Date(d).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
export const tijdLabel = (d) => new Date(d).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
