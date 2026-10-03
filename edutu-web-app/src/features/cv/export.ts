import type { UserCV, CVData, CVTemplateDesign, CVSectionType } from "./types";
import {
  getDensityMetrics,
  getFontStack,
  resolveTemplateDesignById,
  type CVDensityMetrics,
} from "./templates";
function emptyCVData(): CVData {
  return { header: { full_name: "", email: "" } };
}
function formatDate(input?: string | null) {
  if (!input) return "";
  const d = new Date(input);
  return Number.isNaN(d.getTime())
    ? input
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}
export function buildCVText(cv: Partial<UserCV>): string {
  const render = (value: unknown): string => {
    if (Array.isArray(value))
      return value.map(render).filter(Boolean).join("\n");
    if (value && typeof value === "object")
      return Object.entries(value)
        .filter(([key]) => key !== "id" && !key.startsWith("_edutu"))
        .map(([key, v]) =>
          typeof v === "object"
            ? `${key.replace(/_/g, " ")}\n${render(v)}`
            : render(v),
        )
        .filter(Boolean)
        .join("\n");
    return typeof value === "string" ? value : "";
  };
  return render(cv.data_json || {});
}
export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[^a-zA-Z0-9_-]/g, "_") + ".txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function printCV(html: string) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Allow popups to open your printable CV.");
  w.opener = null;
  w.document.write(html);
  w.document.close();
  let printed = false;
  const print = () => {
    if (!printed && !w.closed) {
      printed = true;
      w.print();
    }
  };
  w.addEventListener("load", print, { once: true });
  setTimeout(print, 500);
}
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dateRange(
  start?: string | null,
  end?: string | null,
  current?: boolean,
) {
  const from = formatDate(start);
  const to = current ? "Present" : formatDate(end);
  if (!from && !to) return "";
  return [from, to].filter(Boolean).join(" – ");
}

/** Heading CSS for the four section-rule treatments. */
function sectionHeadingCss(
  design: CVTemplateDesign,
  metrics: CVDensityMetrics,
): string {
  const shared = `font-size: ${design.sectionCase === "upper" ? 12 : 13.5}px; font-weight: 700; letter-spacing: ${design.sectionCase === "upper" ? "1.4px" : "0.2px"}; text-transform: ${design.sectionCase === "upper" ? "uppercase" : "none"}; margin: ${metrics.sectionGap}px 0 ${Math.round(metrics.itemGap * 0.8)}px;`;

  switch (design.sectionRule) {
    case "underline":
      return `h2 { ${shared} color: ${design.accent}; border-bottom: 1.5px solid ${design.accent}; padding-bottom: 3px; }`;
    case "tick":
      return `h2 { ${shared} color: ${design.accent}; border-left: 3px solid ${design.accent}; padding-left: 8px; }`;
    case "boxed":
      return `h2 { ${shared} color: ${design.accent}; background: ${design.accentSoft}; display: inline-block; padding: 4px 10px; border-radius: 4px; }`;
    case "none":
    default:
      return `h2 { ${shared} color: ${design.ink}; }`;
  }
}

/** Header markup + CSS for the four header treatments. */
function renderHeader(
  design: CVTemplateDesign,
  metrics: CVDensityMetrics,
  name: string,
  contactParts: string[],
): { css: string; html: string } {
  const nameHtml = `<h1>${escapeHtml(name)}</h1>`;
  const inlineContact = contactParts.map(escapeHtml).join(" &nbsp;•&nbsp; ");

  const baseCss = `h1 { font-family: ${getFontStack(design.displayFont)}; font-size: ${metrics.nameSize}px; font-weight: 700; letter-spacing: 0.2px; color: ${design.ink}; }
  .contact { margin-top: 5px; color: ${design.muted}; font-size: ${metrics.baseFontSize - 1}px; }`;

  switch (design.headerStyle) {
    case "centered":
      return {
        css: `${baseCss}
  .hdr { text-align: center; padding-bottom: ${Math.round(metrics.sectionGap * 0.5)}px; border-bottom: 1px solid ${design.accent}; }`,
        html: `<header class="hdr">${nameHtml}${inlineContact ? `<div class="contact">${inlineContact}</div>` : ""}</header>`,
      };

    case "band":
      // Negative margins bleed the accent band to the page edge, then restore
      // the page gutter inside it.
      return {
        css: `${baseCss}
  h1 { color: #FFFFFF; }
  .hdr { background: ${design.accent}; margin: -${metrics.pagePaddingY}px -${metrics.pagePaddingX}px ${metrics.sectionGap}px; padding: ${metrics.pagePaddingY}px ${metrics.pagePaddingX}px ${Math.round(metrics.pagePaddingY * 0.7)}px; }
  .hdr .contact { color: rgba(255,255,255,0.88); }`,
        html: `<header class="hdr">${nameHtml}${inlineContact ? `<div class="contact">${inlineContact}</div>` : ""}</header>`,
      };

    case "split":
      return {
        css: `${baseCss}
  .hdr { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding-bottom: ${Math.round(metrics.sectionGap * 0.5)}px; border-bottom: 2px solid ${design.accent}; }
  .hdr .contact { margin-top: 0; text-align: right; line-height: 1.55; }
  .hdr .contact div { white-space: nowrap; }`,
        html: `<header class="hdr"><div>${nameHtml}</div>${
          contactParts.length
            ? `<div class="contact">${contactParts.map((part) => `<div>${escapeHtml(part)}</div>`).join("")}</div>`
            : ""
        }</header>`,
      };

    case "left":
    default:
      return {
        css: baseCss,
        html: `<header class="hdr">${nameHtml}${inlineContact ? `<div class="contact">${inlineContact}</div>` : ""}</header>`,
      };
  }
}

/** Skills markup for the three skill treatments. `inline` is the ATS-safest. */
function renderSkills(design: CVTemplateDesign, skills: string[]): string {
  if (!skills.length) return "";
  switch (design.skillStyle) {
    case "chips":
      return `<div class="skills">${skills.map((s) => `<span class="skill">${escapeHtml(s)}</span>`).join("")}</div>`;
    case "bulleted":
      return `<ul class="skill-list">${skills.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`;
    case "inline":
    default:
      return `<p>${skills.map(escapeHtml).join(" &nbsp;·&nbsp; ")}</p>`;
  }
}

/**
 * Renders a print-friendly resume as HTML for expo-print's printToFileAsync,
 * styled by the chosen template's design spec.
 *
 * Every template stays single-column with semantic headings so ATS parsers
 * can read it; the spec varies typography, colour, header treatment, section
 * rules, density and section order. Pass `design` explicitly when the caller
 * already resolved it (the preview does, so both agree); otherwise it is
 * derived from `cv.template_id`.
 */
export function buildCVHtml(
  cv: Partial<UserCV>,
  design?: CVTemplateDesign | null,
): string {
  const spec = design || resolveTemplateDesignById(cv.template_id);
  const metrics = getDensityMetrics(spec.density);
  const data = cv.data_json || emptyCVData();
  const header: NonNullable<CVData["header"]> =
    data.header || emptyCVData().header!;

  const contactParts = [
    header.email,
    header.phone,
    header.location,
    header.linkedin,
    header.portfolio || header.website,
  ].filter(Boolean) as string[];

  const section = (title: string, body: string) =>
    body ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>` : "";

  const bullets = (items?: string[] | null) => {
    const clean = (items || []).map((h) => (h || "").trim()).filter(Boolean);
    return clean.length
      ? `<ul>${clean.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
      : "";
  };

  const experience = (data.experience || [])
    .filter((item) => item.role || item.company)
    .map(
      (item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.role || "")}</strong><span>${escapeHtml(dateRange(item.start_date, item.end_date, item.current))}</span></div>
        <div class="sub">${escapeHtml([item.company, item.location].filter(Boolean).join(" · "))}</div>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
        ${bullets(item.highlights)}
      </div>`,
    )
    .join("");

  const education = (data.education || [])
    .filter((item) => item.institution || item.degree)
    .map(
      (item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml([item.degree, item.field].filter(Boolean).join(", "))}</strong><span>${escapeHtml(dateRange(item.start_date, item.end_date))}</span></div>
        <div class="sub">${escapeHtml(item.institution || "")}${item.gpa ? ` · GPA ${escapeHtml(item.gpa)}` : ""}</div>
        ${bullets(item.highlights)}
      </div>`,
    )
    .join("");

  const projects = (data.projects || [])
    .filter((item) => item.name)
    .map(
      (item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(dateRange(item.start_date, item.end_date))}</span></div>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
        ${item.technologies?.length ? `<div class="sub">${escapeHtml(item.technologies.join(", "))}</div>` : ""}
        ${item.url ? `<div class="sub">${escapeHtml(item.url)}</div>` : ""}
      </div>`,
    )
    .join("");

  const achievements = (data.achievements || [])
    .filter((item) => item.title)
    .map(
      (item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.title)}</strong>${item.date ? `<span>${escapeHtml(formatDate(item.date))}</span>` : ""}</div>
        ${item.issuer ? `<div class="sub">${escapeHtml(item.issuer)}</div>` : ""}
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      </div>`,
    )
    .join("");

  const research = (data.research || [])
    .filter((item) => item.title || item.institution)
    .map(
      (item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.title || "")}</strong><span>${escapeHtml(dateRange(item.start_date, item.end_date))}</span></div>
        <div class="sub">${escapeHtml([item.role, item.institution].filter(Boolean).join(" · "))}</div>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      </div>`,
    )
    .join("");

  const publications = (data.publications || [])
    .filter((item) => item.title)
    .map(
      (item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.title)}</strong>${item.date ? `<span>${escapeHtml(formatDate(item.date))}</span>` : ""}</div>
        ${
          item.journal || item.coauthors?.length
            ? `<div class="sub">${escapeHtml([item.journal, (item.coauthors || []).join(", ")].filter(Boolean).join(" · "))}</div>`
            : ""
        }
        ${item.url ? `<div class="sub">${escapeHtml(item.url)}</div>` : ""}
      </div>`,
    )
    .join("");

  const references = (data.references || [])
    .filter((item) => item.name)
    .map(
      (item) => `
      <div class="item">
        <div class="row"><strong>${escapeHtml(item.name)}</strong></div>
        <div class="sub">${escapeHtml([item.title, item.organization].filter(Boolean).join(", "))}</div>
        ${
          item.email || item.phone
            ? `<div class="sub">${escapeHtml([item.email, item.phone].filter(Boolean).join(" · "))}</div>`
            : ""
        }
      </div>`,
    )
    .join("");

  const headerParts = renderHeader(
    spec,
    metrics,
    header.full_name || cv.name || "Untitled CV",
    contactParts,
  );

  // Section order comes from the template spec, so "Academic" really does lead
  // with education and research while "Creative" leads with projects.
  const sectionHtml: Partial<Record<CVSectionType, string>> = {
    summary: section(
      "Summary",
      data.summary ? `<p>${escapeHtml(data.summary)}</p>` : "",
    ),
    skills: section(
      "Skills",
      renderSkills(spec, (data.skills || []).filter(Boolean)),
    ),
    experience: section("Experience", experience),
    education: section("Education", education),
    projects: section("Projects", projects),
    achievements: section("Achievements", achievements),
    research: section("Research", research),
    publications: section("Publications", publications),
    references: section("References", references),
    transactions: section("Transactions", (data.transactions || []).map(item => `<div class="item"><div class="row"><strong>${escapeHtml(item.deal_name)}</strong><span>${escapeHtml(formatDate(item.date))}</span></div><div class="sub">${escapeHtml(item.role)}${item.value != null ? ` · ${escapeHtml(item.value)}` : ""}</div>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</div>`).join("")),
  };

  const body = [
    ...spec.sections,
    ...(Object.keys(sectionHtml).filter(
      (key) => !spec.sections.includes(key as CVSectionType),
    ) as CVSectionType[]),
  ]
    .filter((type) => type !== "header")
    .map((type) => sectionHtml[type] || "")
    .join("\n  ");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { color-scheme: light; background: #fff; }
  body { background: #fff; font-family: ${getFontStack(spec.bodyFont)}; color: ${spec.ink}; font-size: ${metrics.baseFontSize}px; line-height: ${metrics.lineHeight}; padding: ${metrics.pagePaddingY}px ${metrics.pagePaddingX}px; }
  ${headerParts.css}
  ${sectionHeadingCss(spec, metrics)}
  section { page-break-inside: auto; }
  .item { margin-bottom: ${metrics.itemGap}px; page-break-inside: avoid; }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .row span { color: ${spec.muted}; font-size: ${metrics.baseFontSize - 1.5}px; white-space: nowrap; }
  .sub { color: ${spec.muted}; font-size: ${metrics.baseFontSize - 1}px; margin-top: 1px; }
  p { margin-top: 3px; }
  ul { margin: 4px 0 0 16px; }
  li { margin-bottom: 2px; }
  .skill-list { columns: 2; margin-top: 2px; }
  .skills { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill { border: 1px solid ${spec.accent}; color: ${spec.accent}; background: ${spec.accentSoft}; border-radius: 999px; padding: 2px 10px; font-size: ${metrics.baseFontSize - 1.5}px; }
</style>
</head>
<body>
  ${headerParts.html}
  ${body}
</body>
</html>`;
}

export { downloadCVPdf } from "./pdf";
