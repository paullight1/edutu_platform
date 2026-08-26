import { CalendarClock, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminApiError } from "../../../lib/apiError";
import type { AutomationSettings as AutomationSettingsModel } from "../model/types";

interface AutomationSettingsProps {
  settings: AutomationSettingsModel;
  pending: boolean;
  error: AdminApiError | null;
  onSave(settings: AutomationSettingsModel): Promise<void>;
  onNotice(message: string, tone: "success" | "warning" | "error"): void;
}

function errorText(error: AdminApiError): string {
  return error.message.includes(error.requestId)
    ? error.message
    : `${error.message} Reference ${error.requestId}.`;
}

export default function AutomationSettings({
  settings,
  pending,
  error,
  onSave,
  onNotice,
}: AutomationSettingsProps) {
  const [automatic, setAutomatic] = useState(settings.auto_run_enabled);
  const [schedule, setSchedule] = useState(settings.cron_schedule);
  const [recheckDays, setRecheckDays] = useState(
    String(settings.recheck_after_days),
  );
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<AdminApiError | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const resetDraft = () => {
    setAutomatic(settings.auto_run_enabled);
    setSchedule(settings.cron_schedule);
    setRecheckDays(String(settings.recheck_after_days));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    setSavedMessage(null);

    const parsedRecheckDays = Number(recheckDays);
    if (
      !schedule.trim() ||
      !Number.isInteger(parsedRecheckDays) ||
      parsedRecheckDays < 1 ||
      parsedRecheckDays > 365
    ) {
      onNotice(
        "Enter a cron schedule and a recheck interval from 1 to 365 days.",
        "error",
      );
      return;
    }

    const nextSettings: AutomationSettingsModel = {
      ...settings,
      auto_run_enabled: automatic,
      cron_schedule: schedule.trim(),
      recheck_after_days: parsedRecheckDays,
    };

    setSaving(true);
    try {
      await onSave(nextSettings);
      const message = "Automation settings saved.";
      setSavedMessage(message);
      onNotice(message, "success");
    } catch (caught) {
      resetDraft();
      if (caught && typeof caught === "object" && "requestId" in caught) {
        setLocalError(caught as AdminApiError);
      }
      onNotice(
        caught instanceof Error
          ? caught.message
          : "Automation settings could not be saved.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const effectiveError = localError || error;
  const isPending = pending || saving;

  return (
    <section
      className="engine-card engine-automation-card"
      aria-labelledby="engine-automation-title"
    >
      <header className="engine-card-header">
        <span className="engine-card-icon" aria-hidden="true">
          <CalendarClock size={18} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Scheduler policy</p>
          <h2 id="engine-automation-title">Automation settings</h2>
          <p>
            Changes become effective only after the authenticated API confirms
            them.
          </p>
        </div>
      </header>

      <form className="engine-automation-form" onSubmit={submit}>
        <label className="engine-switch-field">
          <span>
            <strong>Enable automatic runs</strong>
            <small>Allow the scheduler to launch configured Engine runs.</small>
          </span>
          <input
            type="checkbox"
            checked={automatic}
            aria-label="Enable automatic runs"
            onChange={(event) => {
              setAutomatic(event.target.checked);
              setSavedMessage(null);
            }}
          />
        </label>

        <div className="engine-field-grid">
          <label className="engine-field">
            <span>Cron schedule</span>
            <input
              value={schedule}
              aria-label="Cron schedule"
              placeholder="0 0 * * *"
              onChange={(event) => {
                setSchedule(event.target.value);
                setSavedMessage(null);
              }}
            />
            <small>UTC schedule using the existing five-field cron format.</small>
          </label>
          <label className="engine-field">
            <span>Recheck after days</span>
            <input
              type="number"
              min={1}
              max={365}
              step={1}
              value={recheckDays}
              aria-label="Recheck after days"
              onChange={(event) => {
                setRecheckDays(event.target.value);
                setSavedMessage(null);
              }}
            />
            <small>How soon active records may be verified again.</small>
          </label>
        </div>

        {effectiveError ? (
          <p className="engine-form-error" role="alert">
            {errorText(effectiveError)}
          </p>
        ) : savedMessage ? (
          <p className="engine-form-success" role="status">
            <ShieldCheck size={14} aria-hidden="true" />
            {savedMessage}
          </p>
        ) : null}

        <footer className="engine-settings-actions">
          <button
            type="button"
            className="engine-secondary-button"
            disabled={isPending}
            onClick={() => {
              resetDraft();
              setLocalError(null);
              setSavedMessage(null);
            }}
          >
            Reset draft
          </button>
          <button
            type="submit"
            className="engine-primary-button"
            aria-label="Save automation settings"
            disabled={isPending}
          >
            <Save size={15} aria-hidden="true" />
            {isPending ? "Saving…" : "Save automation settings"}
          </button>
        </footer>
      </form>
    </section>
  );
}
