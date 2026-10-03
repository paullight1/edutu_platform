import { LockKeyhole } from "lucide-react";
import {
  CV_TEMPLATE_COPY,
  CV_TEMPLATE_ORDER,
  TEMPLATE_DESIGNS,
} from "./templates";
import { CvTemplatePreview } from "./CvTemplatePreview";

interface CvTemplatePickerProps {
  value: string;
  name: string;
  data: Record<string, unknown>;
  isPro: boolean;
  billingLoading: boolean;
  title?: string;
  description?: string;
  compact?: boolean;
  onSelect: (templateId: string) => void;
  onUpgrade: (templateName: string) => void;
}

export function CvTemplatePicker({
  value,
  name,
  data,
  isPro,
  billingLoading,
  title = "Choose a design",
  description = "Preview every design. Your CV content stays editable and can be changed later.",
  compact = false,
  onSelect,
  onUpgrade,
}: CvTemplatePickerProps) {
  return (
    <fieldset className={"cv-template-picker" + (compact ? " is-gallery" : "")}>
      <legend>{title}</legend>
      <p className="feature-muted">{description}</p>
      <div className="cv-template-grid">
        {CV_TEMPLATE_ORDER.map((id) => {
          const design = TEMPLATE_DESIGNS[id];
          const copy = CV_TEMPLATE_COPY[id];
          const selected = value === id;
          const premium = design.isPremium === true;
          const checkingAccess = premium && !isPro && billingLoading;

          return (
            <button
              aria-pressed={selected}
              className={`cv-template-card${selected ? " is-selected" : ""}`}
              disabled={checkingAccess}
              key={id}
              onClick={() => {
                if (selected) return;
                if (premium && !isPro) {
                  onUpgrade(copy.name);
                  return;
                }
                onSelect(id);
              }}
              type="button"
            >
              <span className="cv-template-thumbnail">
                <CvTemplatePreview templateId={id} name={name} data={data} />
              </span>
              <span className="cv-template-copy">
                <span className="cv-template-title-row">
                  <strong>{copy.name}</strong>
                  {premium && (
                    <span className="cv-template-badge">
                      <LockKeyhole size={12} /> Pro
                    </span>
                  )}
                </span>
                <span className="cv-template-description">
                  {copy.description}
                </span>
                <span className="cv-template-action">
                  {selected
                    ? "Selected"
                    : checkingAccess
                      ? "Checking access…"
                      : premium && !isPro
                        ? "Preview · Unlock"
                        : premium
                          ? "Use premium design"
                          : "Use this design"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
