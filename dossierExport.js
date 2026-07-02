// dossierExport.js
// Genereert een compleet klantdossier als Word-document (.docx), client-side.
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";

const PINK_HEX = "F984E5";

const fmtDatum = (d) =>
  new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

function titel(tekst) {
  return new Paragraph({
    text: tekst,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 150 },
  });
}

function subtitel(tekst) {
  return new Paragraph({
    text: tekst,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 100 },
  });
}

function labelWaarde(label, waarde) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: waarde || "—" }),
    ],
  });
}

function tekstBlok(tekst) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: tekst || "—" })],
  });
}

/**
 * @param {object} client
 * @param {object} organisatie - { naam } of null
 * @param {array} sessions
 * @param {object} intake - intake_antwoorden record of null
 * @param {array} noShows
 * @param {object} voortgang - { uren_gebruikt, uren_resterend } of null
 */
export async function exporteerDossierNaarWord(client, organisatie, sessions, intake, noShows, voortgang) {
  const children = [];

  // ---- Header ----
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: "Open Your Mind Bewustzijn", bold: true, size: 28, color: PINK_HEX })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [new TextRun({ text: "Cliëntdossier", size: 22, color: "666666" })],
    })
  );

  // ---- Klantgegevens ----
  children.push(titel(client.naam));
  children.push(labelWaarde("Dossiernummer", client.dossiernummer));
  children.push(labelWaarde("Status", client.status));
  children.push(labelWaarde("Adres", client.adres ? `${client.adres}${client.plaats ? ", " + client.plaats : ""}` : ""));
  children.push(labelWaarde("Telefoon", client.telefoon));
  children.push(labelWaarde("E-mail", client.email));
  children.push(labelWaarde("Organisatie", organisatie?.naam));
  children.push(labelWaarde("Startdatum", client.startdatum ? fmtDatum(client.startdatum) : ""));
  children.push(labelWaarde("Pakket uren totaal", client.pakket_uren_totaal ? `${client.pakket_uren_totaal} uur` : ""));
  if (voortgang) {
    children.push(labelWaarde("Uren gebruikt", `${Number(voortgang.uren_gebruikt || 0).toFixed(1)} uur`));
    children.push(labelWaarde("Uren resterend", `${Number(voortgang.uren_resterend || 0).toFixed(1)} uur`));
  }
  if (client.voortgang_stadium) {
    children.push(labelWaarde("Voortgang naar eindstadium", `${client.voortgang_stadium} (${client.voortgang_percentage || 0}%)`));
  }
  if (client.voortgang_notitie) {
    children.push(labelWaarde("Voortgangsnotitie", client.voortgang_notitie));
  }
  if (client.algemene_notities) {
    children.push(labelWaarde("Algemene notities", client.algemene_notities));
  }

  // ---- Intake ----
  if (intake) {
    children.push(titel("Intake"));
    children.push(
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: `Ingevuld op ${fmtDatum(intake.created_at)}`, italics: true, color: "666666" }),
        ],
      })
    );
    const uitgesloten = ["Naam", "Email_invuller", "_captcha", "_subject", "_template"];
    Object.entries(intake.antwoorden || {})
      .filter(([veld]) => !uitgesloten.includes(veld))
      .forEach(([veld, waarde]) => {
        children.push(subtitel(veld.replace(/_/g, " ")));
        children.push(tekstBlok(waarde));
      });
  }

  // ---- Sessieverslagen ----
  children.push(titel("Sessieverslagen"));
  if (!sessions || sessions.length === 0) {
    children.push(tekstBlok("Nog geen sessies geregistreerd."));
  } else {
    sessions.forEach((s) => {
      children.push(subtitel(fmtDatum(s.datum)));
      children.push(
        labelWaarde(
          "Duur / reistijd / km",
          `${s.duur_minuten} min sessie · ${s.reistijd_minuten || 0} min reistijd · ${s.kilometers || 0} km`
        )
      );
      if (s.verslag) children.push(labelWaarde("Verslag", s.verslag));
      if (s.progressie) children.push(labelWaarde("Progressie", s.progressie));
    });
  }

  // ---- No-shows ----
  if (noShows && noShows.length > 0) {
    children.push(titel("No-shows"));
    noShows.forEach((n) => {
      children.push(
        labelWaarde(
          fmtDatum(n.datum_tijd),
          n.no_show_reden || "Geen reden opgegeven"
        )
      );
    });
  }

  // ---- Footer ----
  children.push(
    new Paragraph({
      spacing: { before: 400 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" } },
      children: [
        new TextRun({
          text: `Gegenereerd op ${fmtDatum(new Date())} · Open Your Mind Bewustzijn · Pinksterbloem 19, 2631 SC Nootdorp`,
          size: 16,
          color: "999999",
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Dossier - ${client.naam}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
