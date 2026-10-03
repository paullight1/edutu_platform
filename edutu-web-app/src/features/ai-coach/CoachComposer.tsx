import TextareaAutosize from "react-textarea-autosize";
import { ArrowUp, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import Button from "../../components/ui/Button";
import "./coachComposer.css";

interface CoachComposerProps {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  onSend: () => void;
  onStop: () => void;
}

export default function CoachComposer({ value, onChange, busy, onSend, onStop }: CoachComposerProps) {
  const { t } = useTranslation();
  return (
    <div className="coach-composer-wrap">
      <form
        className={`coach-composer coach-composer-refined${value.trim() ? "" : " is-empty"}`}
        data-keyboard-scope
        onSubmit={(event) => { event.preventDefault(); if (!busy && value.trim()) onSend(); }}
      >
        <label className="sr-only" htmlFor="coach-question">{t("workspaceCopy.yourQuestion", { defaultValue: "Your question" })}</label>
        <TextareaAutosize
          id="coach-question"
          className="coach-input"
          minRows={1}
          maxRows={5}
          maxLength={500}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("coachPage.placeholder", { defaultValue: "Message Edutu…" })}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!busy && value.trim()) onSend();
            }
          }}
        />
        <div className="coach-composer-controls">
          <span className="coach-composer-count">{value.length}/500</span>
          <Button
            type={busy ? "button" : "submit"}
            className="coach-composer-submit"
            disabled={!busy && !value.trim()}
            onClick={busy ? onStop : undefined}
            aria-label={busy ? t("workspaceCopy.stop", { defaultValue: "Stop" }) : t("coachPage.send", { defaultValue: "Send message" })}
          >
            {busy ? <Square size={16} fill="currentColor" /> : <ArrowUp size={21} strokeWidth={2.5} />}
          </Button>
        </div>
      </form>
      <p className="coach-composer-caveat">
        {t("coachPage.aiCanMakeMistakes", { defaultValue: "AI can make mistakes. Check important details." })}
      </p>
    </div>
  );
}
