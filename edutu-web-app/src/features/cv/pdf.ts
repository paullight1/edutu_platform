import type { UserCV } from "./types";
import { buildCVHtml } from "./export";
import { resolveTemplateDesignById, getDensityMetrics } from "./templates";

const fonts = new Map<string, Promise<string[]>>();
function loadFonts(family: string) {
  const cached = fonts.get(family);
  if (cached) return cached;
  const pending = Promise.all(["Regular", "Bold"].map(async weight => {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/cv/${family}-${weight}.ttf`);
    if (!response.ok) throw new Error("PDF fonts could not load. Please try again.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let value = "";
    for (let start = 0; start < bytes.length; start += 8192) value += String.fromCharCode(...bytes.subarray(start, start + 8192));
    return btoa(value);
  })).catch(error => { fonts.delete(family); throw error; });
  fonts.set(family, pending);
  return pending;
}

/** Uses the same semantic content and template order as the HTML renderer.
 * Text is drawn as PDF text, never screenshots; links and page breaks survive export.
 */
export async function createCVPdf(cv: Partial<UserCV>) {
  const design = resolveTemplateDesignById(cv.template_id);
  const family = design.bodyFont === "serif" ? "NotoSerif" : "NotoSans";
  const displayFamily = design.displayFont === "serif" ? "NotoSerif" : "NotoSans";
  const [{ jsPDF }, [regular, bold], displayFonts] = await Promise.all([import("jspdf"), loadFonts(family), loadFonts(displayFamily)]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const register = (font: string, values: string[]) => values.forEach((value, index) => {
    const weight = index === 0 ? "Regular" : "Bold";
    doc.addFileToVFS(`${font}-${weight}.ttf`, value);
    doc.addFont(`${font}-${weight}.ttf`, font, index === 0 ? "normal" : "bold");
  });
  register(family, [regular, bold]);
  if (displayFamily !== family) register(displayFamily, displayFonts);
  const metrics = getDensityMetrics(design.density);
  const content = new DOMParser().parseFromString(buildCVHtml(cv), "text/html");
  const margin = metrics.pagePaddingX * .75, width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  const leading = metrics.baseFontSize * .75 * metrics.lineHeight;
  let y = margin;
  const ensure = (height: number) => { if (y + height > bottom) { doc.addPage(); y = margin; } };
  const text = (value: string, size = 10, weight = "normal", color = design.ink, indent = 0, centered = false, font = family) => {
    if (!value.trim()) return;
    doc.setFont(font, weight); doc.setFontSize(size); doc.setTextColor(color);
    const lines = doc.splitTextToSize(value.trim(), width - indent) as string[];
    for (const line of lines) {
      ensure(leading);
      const x = centered ? margin + width / 2 : margin + indent;
      doc.text(line, x, y + size, centered ? { align: "center" } : undefined);
      // Only validated URL/email destinations become PDF links.
      const links = line.matchAll(/https?:\/\/[^\s]+|(?:www\.)[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi);
      for (const match of links) {
        const url = match[0];
        const lineStart = centered ? margin + (width - doc.getTextWidth(line)) / 2 : margin + indent;
        doc.link(lineStart + doc.getTextWidth(line.slice(0, match.index)), y, doc.getTextWidth(url), leading, { url: url.includes("@") ? `mailto:${url}` : /^https?:/.test(url) ? url : `https://${url}` });
      }
      y += size > 18 ? size + 7 : leading;
    }
  };
  const header = content.querySelector("header");
  const contacts = header?.querySelector(".contact");
  const contactText = contacts?.textContent || "";
  if (design.headerStyle === "band") {
    doc.setFont(family, "normal"); doc.setFontSize(9);
    const height = margin + 31 + doc.splitTextToSize(contactText, width).length * leading + 20;
    doc.setFillColor(design.accent); doc.rect(0, 0, doc.internal.pageSize.getWidth(), height, "F");
  }
  text(header?.querySelector("h1")?.textContent || cv.name || "My CV", metrics.nameSize * .75, "bold", design.headerStyle === "band" ? "#ffffff" : design.ink, 0, design.headerStyle === "centered", displayFamily);
  if (contacts) text(contactText, 9, "normal", design.headerStyle === "band" ? "#ffffff" : design.muted, 0, design.headerStyle === "centered");
  y += 12;
  if (design.headerStyle === "centered" || design.headerStyle === "split") {
    doc.setDrawColor(design.accent); doc.line(margin, y, margin + width, y); y += 8;
  }
  const render = (node: Element) => {
    if (node.classList.contains("row")) {
      text(Array.from(node.children).map(child => child.textContent).filter(Boolean).join("  ·  "), 10, "bold");
    } else if (node.classList.contains("skills")) {
      text(Array.from(node.children).map(child => child.textContent).join(" · "));
    } else if (node.matches("p, li, .sub")) {
      text(`${node.tagName === "LI" ? "• " : ""}${node.textContent || ""}`, node.classList.contains("sub") ? 9 : 10, "normal", node.classList.contains("sub") ? design.muted : design.ink, node.tagName === "LI" ? 8 : 0);
      y += 3;
    } else {
      Array.from(node.children).forEach(render);
      if (node.classList.contains("item")) y += 7;
    }
  };
  for (const section of content.querySelectorAll("section")) {
    ensure(50); y += 10;
    const heading = section.querySelector("h2")?.textContent || "";
    if (design.sectionRule === "boxed") {
      doc.setFillColor(design.accentSoft); doc.rect(margin, y - 2, width, leading + 4, "F");
    } else if (design.sectionRule === "tick") {
      doc.setDrawColor(design.accent); doc.setLineWidth(2); doc.line(margin - 6, y, margin - 6, y + leading);
    }
    text(design.sectionCase === "upper" ? heading.toUpperCase() : heading, 11, "bold", design.accent);
    if (design.sectionRule === "underline") { doc.setDrawColor(design.accent); doc.setLineWidth(.6); doc.line(margin, y + 2, margin + width, y + 2); }
    y += 8;
    Array.from(section.children).filter(child => child.tagName !== "H2").forEach(render);
  }
  doc.setProperties({ title: cv.name || "CV", creator: "Edutu" });
  return doc;
}
export function cvPdfFilename(name?: string) {
  return `${(name || "My CV").replace(/[^\p{L}\p{N}_-]+/gu, "_")}.pdf`;
}
export async function downloadCVPdf(cv: Partial<UserCV>) {
  const doc = await createCVPdf(cv);
  const url = URL.createObjectURL(doc.output("blob"));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = cvPdfFilename(cv.name);
  document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
