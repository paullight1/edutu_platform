import { DatabaseZap, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminApiError } from "../../../lib/apiError";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import type { PurgeExpiredOutcome } from "../hooks/useEngineAutomation";
import type { AutomationSettings } from "../model/types";

interface RetentionSettingsProps {
  settings: AutomationSettings;
  pending: boolean;
  error: AdminApiError | null;
  onSave(settings: AutomationSettings): Promise<void>;
  onPurge(olderThanDays: number): Promise<PurgeExpiredOutcome>;
  onNotice(message: string, tone: "success" | "warning" | "error"): void;
}

function errorText(error: AdminApiError): string {
  return error.message.includes(error.requestId)
    ? error.message
    : `${error.message} Reference ${error.requestId}.`;
}

export default function RetentionSettings({
  settings,
  pending,
  error,
  onSave,
  onPurge,
  onNotice,
}: RetentionSettingsProps) {
  const [retentionInput, setRetentionInput] = useState(
    settings.data_retention_days == null
      ? ""
      : String(settings.data_retention_days),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [localError, setLocalError] = useState<AdminApiError | null>(null);

  const confirmedRetentionDays = settings.data_retention_days;
  const isPending = pending || saving || purging;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    const parsed = retentionInput.trim() ? Number(retentionInput) : null;
    if (
      parsed !== null &&
      (!Number.isInteger(parsed) || parsed < 1 || parsed > 3_650)
    ) {
      onNotice("Retention days must be blank or a whole number from 1 to 3650.", "error");
      return;
    }

    setSaving(true);
    try {
      await onSave({ ...settings, data_retention_days: parsed });
      onNotice("Retention settings saved.", "success");
    } catch (caught) {
      setRetentionInput(
        settings.data_retention_days == null
          ? ""
          : String(settings.data_retention_days),
      );
      if (caught && typeof caught === "object" && "requestId" in caught) {
        setLocalError(caught as AdminApiError);
      }
      onNotice(
        caught instanceof Error
          ? caught.message
          : "Retention settings could not be saved.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const purge = async () => {
    if (confirmedRetentionDays == null) return;
    setPurging(true);
    setLocalError(null);
    try {
      const result = await onPurge(confirmedRetentionDays);
      onNotice(
        `Purged ${result.deletedCount.toLocaleString()} expired opportunities.`,
        "success",
      );
      setConfirmOpen(false);
    } catch (caught) {
      if (caught && typeof caught === "object" && "requestId" in caught) {
        setLocalError(caught as AdminApiError);
      }
      onNotice(
        caught instanceof Error
          ? caught.message
          : "Expired opportunities could not be purged.",
        "error",
      );
    } finally {
      setPurging(false);
    }
  };

  const effectiveError = localError || error;

  return (
    <section
      className="engine-card engine-automation-card"
      aria-labelledby="engine-retention-title"
    >
      <header className="engine-card-header">
        <span className="engine-card-icon" aria-hidden="true">
          <DatabaseZap size={18} />
        </span>
        <div>
          <p className="engine-card-eyebrow">Data lifecycle</p>
          <h2 id="engine-retention-title">Retention settings</h2>
          <p>
            Store the retention policy separately from the destructive purge
            action. Purging always requires a fresh confirmation.
          </p>
        </div>
      </header>

      <form className="engine-automation-form" onSubmit={save}>
        <label className="engine-field">
          <span>Retention days</span>
          <input
            type="number"
            min={1}
            max={3_650}
            step={1}
            value={retentionInput}
            aria-label="Retention days"
            placeholder="No automatic expiry"
            onChange={(event) => setRetentionInput(event.target.value)}
          />
          <small>
            Leave blank to disable retention-based purging. Saving this value
            does not delete data.
          </small>
        </label>

        {effectiveError ? (
          <p className="engine-form-error" role="alert">
            {errorText(effectiveError)}
          </p>
        ) : null}

        <footer className="engine-settings-actions engine-settings-actions--split">
          <button
            type="button"
            className="engine-source-action engine-source-action--danger"
            aria-label="Purge expired opportunities"
            disabled={isPending || confirmedRetentionDays == null}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 size={15} aria-hidden="true" />
            Purge expired opportunities
          </button>
          <button
            type="submit"
            className="engine-primary-button"
            aria-label="Save retention settings"
            disabled={isPending}
          >
            <Save size={15} aria-hidden="true" />
            {saving ? "Saving…" : "Save retention settings"}
          </button>
        </footer>
      </form>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Purge expired opportunities?"
        message={
          confirmedRetentionDays == null
            ? "No confirmed retention period is configured."
            : `Permanently delete opportunities older than ${confirmedRetentionDays.toLocaleString()} days where the backend retention policy allows it. This cannot be undone.`
        }
        confirmLabel="Purge data"
        loading={purging}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={purge}
      />
    </section>
  );
}
