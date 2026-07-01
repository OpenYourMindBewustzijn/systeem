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
 * @param {object} factuur - { factuurnummer, periode_start, periode_eind, subtotaal, btw_bedrag, totaal }
 * @param {object} klant - { naam, adres, dossiernummer }
 * @param {array} sessies - array van session_bedragen rijen die in deze factuur zitten
 */
export function genereerFactuurPDF(factuur, klant, sessies) {
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
  doc.setTextColor(20, 20, 20);
  doc.text("FACTUUR", 190, 25, { align: "right" });
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(factuur.factuurnummer, 190, 32, { align: "right" });

  y += 15;
  doc.setDrawColor(230, 230, 230);
  doc.line(marge, y, 190, y);
  y += 12;

  // Klantgegevens
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("Aan:", marge, y);
  y += 6;
  doc.setFontSize(11);
  doc.text(klant.naam, marge, y);
  y += 6;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  if (klant.adres) {
    doc.text(klant.adres, marge, y);
    y += 6;
  }
  if (klant.dossiernummer) {
    doc.text(`Dossiernummer: ${klant.dossiernummer}`, marge, y);
    y += 6;
  }

  // Factuurdata rechts
  const rechterKolomX = 130;
  let yr = y - (klant.adres ? 18 : 12);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Factuurdatum: ${fmtDatum(new Date())}`, rechterKolomX, yr);
  yr += 6;
  doc.text(`Periode: ${fmtDatum(factuur.periode_start)} – ${fmtDatum(factuur.periode_eind)}`, rechterKolomX, yr);

  y += 12;

  // Tabel header
  doc.setFillColor(249, 132, 229); // OYMB roze
  doc.rect(marge, y, 170, 9, "F");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("Datum", marge + 3, y + 6);
  doc.text("Omschrijving", marge + 35, y + 6);
  doc.text("Uren", marge + 110, y + 6);
  doc.text("Km", marge + 130, y + 6);
  doc.text("Bedrag", 187, y + 6, { align: "right" });
  y += 9;

  // Tabel rijen
  doc.setTextColor(40, 40, 40);
  sessies.forEach((s, i) => {
    const uren = ((s.duur_minuten + s.reistijd_minuten) / 60).toFixed(2);
    const rijHoogte = 8;
    if (i % 2 === 1) {
      doc.setFillColor(248, 248, 248);
      doc.rect(marge, y, 170, rijHoogte, "F");
    }
    doc.setFontSize(9);
    doc.text(fmtDatum(s.datum), marge + 3, y + 5.5);
    doc.text("Begeleidingssessie + reistijd", marge + 35, y + 5.5);
    doc.text(uren, marge + 110, y + 5.5);
    doc.text(String(s.kilometers || 0), marge + 130, y + 5.5);
    doc.text(euro(s.subtotaal_excl_btw), 187, y + 5.5, { align: "right" });
    y += rijHoogte;
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
  doc.setTextColor(20, 20, 20);
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
  doc.text("Gelieve binnen 14 dagen te betalen onder vermelding van het factuurnummer.", marge, y + 5);

  doc.save(`${factuur.factuurnummer}.pdf`);
}
