export interface EditorCv {
  id: string;
  name: string;
  data: Record<string, unknown>;
  templateId: string | null;
  updatedAt: string;
  source: "mobile";
}
export type CvSection =
  | "experience"
  | "education"
  | "projects"
  | "achievements"
  | "research"
  | "publications"
  | "references"
  | "transactions";
export const SECTION_FIELDS: Record<
  CvSection,
  Array<{ key: string; label: string }>
> = {
  experience: [
    { key: "role", label: "Role" },
    { key: "company", label: "Organisation" },
    { key: "start_date", label: "Start date" },
    { key: "end_date", label: "End date" },
    { key: "description", label: "What you did" },
  ],
  education: [
    { key: "degree", label: "Degree" },
    { key: "institution", label: "Institution" },
    { key: "field", label: "Field of study" },
    { key: "start_date", label: "Start date" },
    { key: "end_date", label: "End date" },
  ],
  projects: [
    { key: "name", label: "Project" },
    { key: "description", label: "Description" },
    { key: "url", label: "Link" },
  ],
  achievements: [
    { key: "title", label: "Achievement" },
    { key: "issuer", label: "Awarded by" },
    { key: "description", label: "Description" },
  ],
  research: [
    { key: "title", label: "Research title" },
    { key: "institution", label: "Institution" },
    { key: "description", label: "Description" },
  ],
  transactions: [
    { key: "deal_name", label: "Deal / transaction" },
    { key: "role", label: "Your role" },
    { key: "date", label: "Date" },
    { key: "description", label: "Description" },
  ],
  publications: [
    { key: "title", label: "Publication" },
    { key: "journal", label: "Journal / publisher" },
    { key: "authors", label: "Authors" },
    { key: "date", label: "Date" },
  ],
  references: [
    { key: "name", label: "Name" },
    { key: "title", label: "Title" },
    { key: "organization", label: "Organisation" },
    { key: "email", label: "Email" },
  ],
};
