import { useId, useMemo, useState } from "react";
import { Copy, Download, MoreHorizontal, PencilLine, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorCv } from "./api";
import { CV_TEMPLATE_COPY } from "./templates";
import { CvTemplatePreview } from "./CvTemplatePreview";

interface Props {
  cvs: EditorCv[];
  busy: boolean;
  onPreview: (cv: EditorCv) => void;
  onEdit: (cv: EditorCv) => void;
  onRename: (cv: EditorCv) => void;
  onDuplicate: (cv: EditorCv) => void;
  onDownload: (cv: EditorCv) => void;
  onDelete: (cv: EditorCv) => void;
}

export function CvLibrary({ cvs, busy, onPreview, onEdit, onRename, onDuplicate, onDownload, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => cvs
    .filter(cv => `${cv.name} ${CV_TEMPLATE_COPY[cv.templateId as keyof typeof CV_TEMPLATE_COPY]?.name || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)), [cvs, query]);
  const act = (button: HTMLButtonElement, action: () => void) => {
    const details = button.closest("details");
    details?.removeAttribute("open");
    details?.querySelector("summary")?.focus();
    action();
  };
  return <section className="cv-library" aria-labelledby={`${id}-title`}>
    <div className="cv-library-toolbar">
      <div><h2 id={`${id}-title`}>{t("cv.library.title", { defaultValue: "Your CVs" })}</h2><p>{t("cv.library.subtitle", { defaultValue: "Keep a version for each opportunity. Your most recent CVs appear first." })}</p></div>
      <label className="cv-library-search"><Search size={17} aria-hidden="true"/><span className="sr-only">{t("cv.library.search", { defaultValue: "Search your CVs" })}</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("cv.library.searchPlaceholder", { defaultValue: "Find a CV or design" })}/></label>
    </div>
    <p className="cv-library-count" role="status">{t("cv.library.results", { defaultValue: "Showing {{count}} of {{total}}", count: filtered.length, total: cvs.length })}</p>
    <div className="cv-library-grid">
      {filtered.map(row => {
        const titleId = `${id}-${row.id}`;
        const design = CV_TEMPLATE_COPY[row.templateId as keyof typeof CV_TEMPLATE_COPY]?.name || "Minimal ATS";
        const updated = new Date(row.updatedAt);
        return <article className="cv-saved-card" key={row.id} aria-labelledby={titleId}>
          <button type="button" className="cv-card-preview" disabled={busy} aria-label={t("cv.library.preview", { defaultValue: "Preview {{name}}", name: row.name })} onClick={() => onPreview(row)}>
            <div className="cv-thumbnail-window"><CvTemplatePreview templateId={row.templateId} name={row.name} data={row.data}/></div>
            <span className="cv-card-preview-label">{t("cv.library.openPreview", { defaultValue: "Open preview" })}</span>
          </button>
          <div className="cv-card-info"><span className="cv-card-design">{design}</span><h3 id={titleId}>{row.name}</h3><p>{Number.isNaN(updated.getTime()) ? t("cv.library.saved", { defaultValue: "Saved CV" }) : t("cv.library.updated", { defaultValue: "Updated {{date}}", date: updated.toLocaleDateString(i18n.language, { month: "short", day: "numeric", year: "numeric" }) })}</p></div>
          <div className="cv-card-actions">
            <button type="button" disabled={busy} aria-describedby={titleId} onClick={() => onEdit(row)}><PencilLine size={16}/>{t("cv.library.edit", { defaultValue: "Edit" })}</button>
            <details><summary aria-label={t("cv.library.more", { defaultValue: "More actions for {{name}}", name: row.name })}><MoreHorizontal size={20}/></summary><div className="cv-card-menu">
              <button type="button" disabled={busy} onClick={e => act(e.currentTarget, () => onRename(row))}><PencilLine size={15}/>{t("cv.library.rename", { defaultValue: "Rename" })}</button>
              <button type="button" disabled={busy} onClick={e => act(e.currentTarget, () => onDuplicate(row))}><Copy size={15}/>{t("cv.library.duplicate", { defaultValue: "Duplicate" })}</button>
              <button type="button" disabled={busy} onClick={e => act(e.currentTarget, () => onDownload(row))}><Download size={15}/>{t("cv.library.download", { defaultValue: "Download PDF" })}</button>
              <button type="button" className="cv-delete-action" disabled={busy} onClick={e => act(e.currentTarget, () => onDelete(row))}><Trash2 size={15}/>{t("cv.library.delete", { defaultValue: "Delete" })}</button>
            </div></details>
          </div>
        </article>;
      })}
    </div>
    {!filtered.length && <div className="cv-search-empty"><h3>{t("cv.library.noMatches", { defaultValue: "No CVs match your search" })}</h3><p>{t("cv.library.tryAnother", { defaultValue: "Try another CV name or design." })}</p><button type="button" className="feature-button secondary" onClick={() => setQuery("")}>{t("cv.library.clear", { defaultValue: "Clear search" })}</button></div>}
  </section>;
}
