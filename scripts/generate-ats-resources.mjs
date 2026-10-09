import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import PDFDocument from "pdfkit";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun
} from "docx";

const outputDirectory = path.resolve("demo/public/resources");
fs.mkdirSync(outputDirectory, { recursive: true });
const generatedAt = new Date("1980-01-01T00:00:00.000Z");

async function normalizeDocx(buffer) {
  const archive = await JSZip.loadAsync(buffer);
  const coreProperties = archive.file("docProps/core.xml");
  const fixedTimestamp = generatedAt.toISOString();
  archive.file(
    "docProps/core.xml",
    (await coreProperties.async("string")).replaceAll(
      /<dcterms:(created|modified) xsi:type="dcterms:W3CDTF">[^<]+<\/dcterms:\1>/g,
      (_, property) => `<dcterms:${property} xsi:type="dcterms:W3CDTF">${fixedTimestamp}</dcterms:${property}>`
    )
  );
  archive.forEach((_, entry) => {
    entry.date = generatedAt;
  });
  return archive.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "DOS"
  });
}

const sections = [
  ["TITRE PROFESSIONNEL", "Métier ciblé — spécialité principale"],
  ["RÉSUMÉ PROFESSIONNEL", "3 à 5 lignes factuelles présentant votre niveau, vos domaines de compétence et le type de contribution recherchée."],
  ["COMPÉTENCES", "Compétence 1 · Compétence 2 · Outil 1 · Méthode 1 · Langue"],
  ["EXPÉRIENCE PROFESSIONNELLE", "Poste — Entreprise — Ville | MM/AAAA – MM/AAAA\n• Action réalisée, outil utilisé et résultat vérifiable.\n• Deuxième responsabilité ou réalisation factuelle."],
  ["PROJETS", "Nom du projet | MM/AAAA\n• Problème traité, contribution personnelle, technologies et résultat."],
  ["FORMATION", "Diplôme — Établissement — Ville | AAAA"],
  ["CERTIFICATIONS", "Certification — Organisme | AAAA"],
  ["LANGUES", "Langue — niveau réel"]
];

const children = [
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "PRÉNOM NOM", bold: true, size: 34 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Ville · Téléphone · email@exemple.com · portfolio.example")] }),
  ...sections.flatMap(([title, content]) => [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1, spacing: { before: 220, after: 80 } }),
    ...content.split("\n").map((line) => new Paragraph({ text: line, spacing: { after: 80 } }))
  ]),
  new Paragraph({ spacing: { before: 260 }, children: [new TextRun({ text: "Règle: ne jamais inventer une expérience, une date, une compétence ou un résultat.", italics: true })] })
];

const document = new Document({
  creator: "TECH ZONE",
  lastModifiedBy: "TECH ZONE",
  created: generatedAt,
  modified: generatedAt,
  styles: {
    default: { document: { run: { font: "Arial", size: 21 }, paragraph: { spacing: { line: 260 } } } },
    paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", quickFormat: true, run: { font: "Arial", size: 23, bold: true, color: "0050CB" } }]
  },
  sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }]
});

fs.writeFileSync(
  path.join(outputDirectory, "modele-cv-ats-techzone.docx"),
  await normalizeDocx(await Packer.toBuffer(document))
);

const pdf = new PDFDocument({
  size: "A4",
  margin: 48,
  info: {
    Title: "Modèle CV compatible ATS — TECH ZONE",
    Creator: "TECH ZONE",
    CreationDate: generatedAt,
    ModDate: generatedAt
  }
});
const pdfStream = fs.createWriteStream(path.join(outputDirectory, "modele-cv-ats-techzone.pdf"));
pdf.pipe(pdfStream);
pdf.font("Helvetica-Bold").fontSize(20).fillColor("#111c2d").text("PRÉNOM NOM", { align: "center" });
pdf.font("Helvetica").fontSize(9).fillColor("#566074").text("Ville · Téléphone · email@exemple.com · portfolio.example", { align: "center" });
for (const [title, content] of sections) {
  pdf.moveDown(.9).font("Helvetica-Bold").fontSize(10).fillColor("#0050cb").text(title);
  pdf.moveDown(.25).font("Helvetica").fontSize(9).fillColor("#111c2d").text(content, { lineGap: 2 });
}
pdf.moveDown().font("Helvetica-Oblique").fontSize(8).fillColor("#566074").text("Règle: ne jamais inventer une expérience, une date, une compétence ou un résultat.");
pdf.end();

await new Promise((resolve, reject) => {
  pdfStream.on("finish", resolve);
  pdfStream.on("error", reject);
});

console.log(`ATS resources generated in ${outputDirectory}`);
