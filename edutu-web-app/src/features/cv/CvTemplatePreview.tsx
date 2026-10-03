import type { CSSProperties } from "react";
import { CV_TEMPLATE_COPY, TEMPLATE_DESIGNS } from "./templates";

interface CvTemplatePreviewProps {
  templateId?: string | null;
  name: string;
  data: Record<string, unknown>;
}

const SECTION_LABELS: Record<string, string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  achievements: "Achievements",
  research: "Research",
  publications: "Publications",
  references: "References",
  transactions: "Experience",
};

export function CvTemplatePreview({
  templateId,
  name,
  data,
}: CvTemplatePreviewProps) {
  const design =
    TEMPLATE_DESIGNS[templateId || ""] || TEMPLATE_DESIGNS["minimal-ats"];
  const copy = CV_TEMPLATE_COPY[design.slug as keyof typeof CV_TEMPLATE_COPY];
  const header =
    data.header && typeof data.header === "object"
      ? (data.header as Record<string, unknown>)
      : {};
  const fullName = String(header.full_name || name || "Your name");
  const contact = [
    header.email,
    header.location,
    header.linkedin || header.portfolio,
  ]
    .filter((value): value is string => typeof value === "string" && !!value)
    .join(" · ");
  const sectionTypes = design.sections
    .filter((section) => section !== "header")
    .slice(0, 4);
  const style = {
    "--cv-mini-accent": design.accent,
    "--cv-mini-soft": design.accentSoft,
    "--cv-mini-ink": design.ink,
    "--cv-mini-muted": design.muted,
    fontFamily:
      design.bodyFont === "serif" ? "Georgia, serif" : "Arial, sans-serif",
  } as CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={"cv-mini-page cv-mini-header-" + design.headerStyle}
      style={style}
      title={copy?.name || "CV template preview"}
    >
      <span className="cv-mini-heading">
        <strong className="cv-mini-name">{fullName}</strong>
        <span className="cv-mini-contact">
          {contact || "Email · location · portfolio"}
        </span>
      </span>
      {sectionTypes.map((section) => (
        <span className="cv-mini-section" key={section}>
          <strong
            className={
              "cv-mini-section-heading cv-mini-rule-" + design.sectionRule
            }
          >
            {SECTION_LABELS[section] || section}
          </strong>
          <span className="cv-mini-lines">
            <i />
            <i />
          </span>
        </span>
      ))}
    </span>
  );
}
