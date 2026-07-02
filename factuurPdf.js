// lib/factuurPdf.js
// Genereert een PDF-factuur in de browser. Vereist: npm install jspdf
import { jsPDF } from "jspdf";

const BEDRIJF = {
  naam: "Open Your Mind Bewustzijn",
  adres: "Pinksterbloem 19, 2631 SC Nootdorp",
  email: "info@oymb.nl",
  website: "www.oymb.nl",
  kvk: "72648988",
  btwnummer: "NL002180692B49",
  iban: "NL09KNAB0257785973",
};

const euro = (n) => (n || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const fmtDatum = (d) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

/**
 * @param {object} factuur - { factuurnummer, periode_start, periode_eind, subtotaal, btw_bedrag, totaal, credit_van_factuurnummer? }
 * @param {object} organisatie - { naam, adres, contactpersoon }
 * @param {array} sessies - array van session_bedragen rijen die in deze factuur zitten (kunnen meerdere klanten bevatten)
 */
export function genereerFactuurPDF(factuur, organisatie, sessies) {
  const isCredit = Boolean(factuur.credit_van_factuurnummer);
  const doc = new jsPDF();
  const marge = 20;
  let y = 25;

  // Header
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text(BEDRIJF.naam, marge, y);

  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  y += 7;
  doc.text(`${BEDRIJF.adres} · ${BEDRIJF.email} · ${BEDRIJF.website}`, marge, y);

  // Factuurtitel + nummer rechtsboven
  doc.setFontSize(16);
  doc.setTextColor(isCredit ? 192 : 20, isCredit ? 57 : 20, isCredit ? 43 : 20);
  doc.text(isCredit ? "CREDITFACTUUR" : "FACTUUR", 190, 25, { align: "right" });
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(factuur.factuurnummer, 190, 32, { align: "right" });
  if (isCredit) {
    doc.text(`Creditering van: ${factuur.credit_van_factuurnummer}`, 190, 38, { align: "right" });
  }

  y += 15;
  doc.setDrawColor(230, 230, 230);
  doc.line(marge, y, 190, y);
  y += 12;

  // Geadresseerde: de organisatie
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("Aan:", marge, y);
  y += 6;
  doc.setFontSize(11);
  doc.text(organisatie?.naam || "Onbekende organisatie", marge, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  if (organisatie?.adres) {
    doc.text(organisatie.adres, marge, y);
    y += 6;
  }
  if (organisatie?.contactpersoon) {
    doc.text(`T.a.v. ${organisatie.contactpersoon}`, marge, y);
    y += 6;
  }

  // Factuurdata rechts
  const rechterKolomX = 130;
  let yr = y - (organisatie?.adres ? 18 : 12);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Factuurdatum: ${fmtDatum(new Date())}`, rechterKolomX, yr);
  yr += 6;
  doc.text(`Periode: ${fmtDatum(factuur.periode_start)} – ${fmtDatum(factuur.periode_eind)}`, rechterKolomX, yr);

  y += 8;

  // Tabel header — met kolom voor cliëntnaam
  doc.setFillColor(...(isCredit ? [192, 57, 43] : [249, 132, 229]));
  doc.rect(marge, y, 170, 9, "F");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("Datum", marge + 3, y + 6);
  doc.text("Cliënt", marge + 26, y + 6);
  doc.text("Omschrijving", marge + 70, y + 6);
  doc.text("Aantal", marge + 128, y + 6);
  doc.text("Bedrag", 187, y + 6, { align: "right" });
  y += 9;

  // Tabel rijen — per sessie drie regels: sessie-uren, reistijd, km-vergoeding
  // met cliëntnaam op de eerste regel van elke sessie
  const teken = isCredit ? -1 : 1;
  doc.setTextColor(40, 40, 40);
  let rijIndex = 0;
  const rijHoogte = 7;

  sessies.forEach((s) => {
    const sessieUren = s.duur_minuten / 60;
    const reisUren = (s.reistijd_minuten || 0) / 60;
    const uurtarief = s.uurtarief || 85;
    const kmTarief = s.km_tarief || 0.23;

    const regels = [
      {
        omschrijving: "Begeleidingssessie",
        aantal: `${sessieUren.toFixed(2)} u`,
        bedrag: teken * sessieUren * uurtarief,
      },
    ];
    if (reisUren > 0) {
      regels.push({
        omschrijving: "Reistijd",
        aantal: `${reisUren.toFixed(2)} u`,
        bedrag: teken * reisUren * uurtarief,
      });
    }
    if (s.kilometers > 0) {
      regels.push({
        omschrijving: "Kilometervergoeding",
        aantal: `${s.kilometers} km`,
        bedrag: teken * s.kilometers * kmTarief,
      });
    }

    regels.forEach((regel, i) => {
      if (rijIndex % 2 === 1) {
        doc.setFillColor(248, 248, 248);
        doc.rect(marge, y, 170, rijHoogte, "F");
      }
      doc.setFontSize(8.5);
      doc.text(i === 0 ? fmtDatum(s.datum) : "", marge + 3, y + 5);
      doc.text(i === 0 ? s.client_naam || "" : "", marge + 26, y + 5);
      doc.setFontSize(9);
      doc.text(regel.omschrijving, marge + 70, y + 5);
      doc.text(regel.aantal, marge + 128, y + 5);
      doc.text(euro(regel.bedrag), 187, y + 5, { align: "right" });
      y += rijHoogte;
      rijIndex++;
    });
  });

  y += 6;
  doc.setDrawColor(230, 230, 230);
  doc.line(120, y, 190, y);
  y += 8;

  // Totalen
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text("Subtotaal (excl. btw):", 120, y);
  doc.text(euro(factuur.subtotaal), 187, y, { align: "right" });
  y += 7;
  doc.text("Btw (21%):", 120, y);
  doc.text(euro(factuur.btw_bedrag), 187, y, { align: "right" });
  y += 9;

  doc.setFontSize(12);
  doc.setTextColor(isCredit ? 192 : 20, isCredit ? 57 : 20, isCredit ? 43 : 20);
  doc.setFont(undefined, "bold");
  doc.text("Totaal:", 120, y);
  doc.text(euro(factuur.totaal), 187, y, { align: "right" });
  doc.setFont(undefined, "normal");

  // Footer
  y = 270;
  doc.setDrawColor(230, 230, 230);
  doc.line(marge, y, 190, y);
  y += 6;
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  const footerRegels = [
    BEDRIJF.kvk ? `KvK: ${BEDRIJF.kvk}` : null,
    BEDRIJF.btwnummer ? `BTW-nummer: ${BEDRIJF.btwnummer}` : null,
    BEDRIJF.iban ? `IBAN: ${BEDRIJF.iban}` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (footerRegels) doc.text(footerRegels, marge, y);
  doc.text(
    isCredit
      ? "Dit bedrag wordt verrekend met de openstaande factuur."
      : "Gelieve binnen 14 dagen te betalen onder vermelding van het factuurnummer.",
    marge,
    y + 5
  );

  doc.save(`${factuur.factuurnummer}.pdf`);
}
