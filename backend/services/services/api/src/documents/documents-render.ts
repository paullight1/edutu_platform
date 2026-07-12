import PDFDocument from "pdfkit";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { CVDataDto } from "../cv/dto/cv-ai.dto";

/**
 * Pure render layer: structured document content → PDF/DOCX buffers.
 * Both renderers are dependency-light (pdfkit + docx are pure JS) so they
 * run on Render without a headless browser.
 */

export type TextDocSection = { heading: string; body: string };

export type DocumentContent =
  | { kind: "cv"; cv: CVDataDto }
  | { kind: "text_doc"; sections: TextDocSection[] };

const PAGE_MARGIN = 54;

function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function dateRange(start?: string, end?: string, current?: boolean): string {
  const from = start || "";
  const to = current ? "Present" : end || "";
  return [from, to].filter(Boolean).join(" – ");
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export async function renderTextDocPdf(
  title: string,
  sections: TextDocSection[],
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
  doc.font("Helvetica-Bold").fontSize(18).text(title);
  doc.moveDown(0.8);
  for (const section of sections) {
    if (section.heading) {
      doc.font("Helvetica-Bold").fontSize(12).text(section.heading.toUpperCase(), {
        characterSpacing: 0.4,
      });
      doc.moveDown(0.3);
    }
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .text(section.body || "", { lineGap: 3, align: "justify" });
    doc.moveDown(0.9);
  }
  return pdfToBuffer(doc);
}

export async function renderCvPdf(cv: CVDataDto): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
  const header = cv.header || {};

  doc.font("Helvetica-Bold").fontSize(20).text(header.full_name || "Curriculum Vitae");
  const contact = [
    header.email,
    header.phone,
    header.location,
    header.linkedin,
    header.portfolio || header.website,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (contact) {
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text(contact);
    doc.fillColor("#000000");
  }
  doc.moveDown(0.8);

  const sectionTitle = (label: string) => {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(11.5).text(label.toUpperCase(), {
      characterSpacing: 0.6,
    });
    doc
      .moveTo(PAGE_MARGIN, doc.y + 2)
      .lineTo(doc.page.width - PAGE_MARGIN, doc.y + 2)
      .lineWidth(0.7)
      .strokeColor("#999999")
      .stroke();
    doc.strokeColor("#000000");
    doc.moveDown(0.45);
  };
  const body = (text: string, options: PDFKit.Mixins.TextOptions = {}) =>
    doc.font("Helvetica").fontSize(10).text(text, { lineGap: 2, ...options });

  if (cv.summary) {
    sectionTitle("Summary");
    body(cv.summary, { align: "justify" });
  }

  if (cv.experience?.length) {
    sectionTitle("Experience");
    for (const item of cv.experience) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .text(
          [item.role, item.company].filter(Boolean).join(" — ") || "Role",
          { continued: false },
        );
      const meta = [
        dateRange(item.start_date, item.end_date, item.current),
        item.location,
      ]
        .filter(Boolean)
        .join("  ·  ");
      if (meta) doc.font("Helvetica").fontSize(9).fillColor("#555555").text(meta);
      doc.fillColor("#000000");
      if (item.description) body(item.description);
      for (const highlight of item.highlights || []) {
        body(`•  ${highlight}`, { indent: 10 });
      }
      doc.moveDown(0.5);
    }
  }

  if (cv.education?.length) {
    sectionTitle("Education");
    for (const item of cv.education) {
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .text(
          [item.degree, item.field].filter(Boolean).join(", ") ||
            item.institution ||
            "Education",
        );
      const meta = [
        item.institution,
        dateRange(item.start_date, item.end_date),
        typeof item.gpa === "number" ? `GPA ${item.gpa}` : "",
      ]
        .filter(Boolean)
        .join("  ·  ");
      if (meta) doc.font("Helvetica").fontSize(9).fillColor("#555555").text(meta);
      doc.fillColor("#000000");
      for (const highlight of item.highlights || []) {
        body(`•  ${highlight}`, { indent: 10 });
      }
      doc.moveDown(0.5);
    }
  }

  if (cv.skills?.length) {
    sectionTitle("Skills");
    body(cv.skills.join("  ·  "));
  }

  if (cv.projects?.length) {
    sectionTitle("Projects");
    for (const item of cv.projects) {
      doc.font("Helvetica-Bold").fontSize(10.5).text(item.name || "Project");
      if (item.technologies?.length) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#555555")
          .text(item.technologies.join(", "));
        doc.fillColor("#000000");
      }
      if (item.description) body(item.description);
      doc.moveDown(0.5);
    }
  }

  if (cv.achievements?.length) {
    sectionTitle("Achievements");
    for (const item of cv.achievements) {
      body(
        `•  ${[item.title, item.issuer, item.date].filter(Boolean).join(" — ")}`,
      );
      if (item.description) body(`   ${item.description}`, { indent: 10 });
    }
  }

  return pdfToBuffer(doc);
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────

function docxHeading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true })],
  });
}

function docxBody(text: string, options: { bullet?: boolean } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    ...(options.bullet ? { bullet: { level: 0 } } : {}),
    children: [new TextRun({ text })],
  });
}

export async function renderTextDocDocx(
  title: string,
  sections: TextDocSection[],
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: title, bold: true })],
    }),
  ];
  for (const section of sections) {
    if (section.heading) children.push(docxHeading(section.heading));
    for (const paragraph of (section.body || "").split(/\n{2,}/)) {
      if (paragraph.trim()) children.push(docxBody(paragraph.trim()));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function renderCvDocx(cv: CVDataDto): Promise<Buffer> {
  const header = cv.header || {};
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({ text: header.full_name || "Curriculum Vitae", bold: true }),
      ],
    }),
  ];
  const contact = [
    header.email,
    header.phone,
    header.location,
    header.linkedin,
    header.portfolio || header.website,
  ]
    .filter(Boolean)
    .join("  ·  ");
  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 160 },
        children: [new TextRun({ text: contact, size: 18, color: "555555" })],
      }),
    );
  }

  if (cv.summary) {
    children.push(docxHeading("Summary"), docxBody(cv.summary));
  }

  if (cv.experience?.length) {
    children.push(docxHeading("Experience"));
    for (const item of cv.experience) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({
              text: [item.role, item.company].filter(Boolean).join(" — ") || "Role",
              bold: true,
            }),
          ],
        }),
      );
      const meta = [
        dateRange(item.start_date, item.end_date, item.current),
        item.location,
      ]
        .filter(Boolean)
        .join("  ·  ");
      if (meta) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: meta, size: 18, color: "555555" })],
          }),
        );
      }
      if (item.description) children.push(docxBody(item.description));
      for (const highlight of item.highlights || []) {
        children.push(docxBody(highlight, { bullet: true }));
      }
    }
  }

  if (cv.education?.length) {
    children.push(docxHeading("Education"));
    for (const item of cv.education) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [
            new TextRun({
              text:
                [item.degree, item.field].filter(Boolean).join(", ") ||
                item.institution ||
                "Education",
              bold: true,
            }),
          ],
        }),
      );
      const meta = [
        item.institution,
        dateRange(item.start_date, item.end_date),
        typeof item.gpa === "number" ? `GPA ${item.gpa}` : "",
      ]
        .filter(Boolean)
        .join("  ·  ");
      if (meta) {
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            children: [new TextRun({ text: meta, size: 18, color: "555555" })],
          }),
        );
      }
      for (const highlight of item.highlights || []) {
        children.push(docxBody(highlight, { bullet: true }));
      }
    }
  }

  if (cv.skills?.length) {
    children.push(docxHeading("Skills"), docxBody(cv.skills.join("  ·  ")));
  }

  if (cv.projects?.length) {
    children.push(docxHeading("Projects"));
    for (const item of cv.projects) {
      children.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          children: [new TextRun({ text: item.name || "Project", bold: true })],
        }),
      );
      if (item.technologies?.length) {
        children.push(docxBody(item.technologies.join(", ")));
      }
      if (item.description) children.push(docxBody(item.description));
    }
  }

  if (cv.achievements?.length) {
    children.push(docxHeading("Achievements"));
    for (const item of cv.achievements) {
      children.push(
        docxBody(
          [item.title, item.issuer, item.date].filter(Boolean).join(" — "),
          { bullet: true },
        ),
      );
      if (item.description) children.push(docxBody(item.description));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function renderDocument(
  title: string,
  content: DocumentContent,
  format: "pdf" | "docx",
): Promise<Buffer> {
  if (content.kind === "cv") {
    return format === "pdf" ? renderCvPdf(content.cv) : renderCvDocx(content.cv);
  }
  return format === "pdf"
    ? renderTextDocPdf(title, content.sections)
    : renderTextDocDocx(title, content.sections);
}
