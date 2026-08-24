import { FolderPlus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  BulkSourceDefaults,
  BulkSourceOutcome,
} from "../hooks/useEngineSources";
import type {
  CreateScrapeSourceInput,
  ScrapeSource,
  SourceMutationResult,
} from "../model/types";

interface AddSourceDialogProps {
  isOpen: boolean;
  sources: readonly ScrapeSource[];
  pending: boolean;
  onClose(): void;
  onCreate(input: CreateScrapeSourceInput): Promise<SourceMutationResult>;
  onBulk(text: string, defaults: BulkSourceDefaults): Promise<BulkSourceOutcome>;
  onNotice(message: string, tone: "success" | "warning" | "error"): void;
}

type SourceMode = "single" | "group";

function outcomeMessage(outcome: BulkSourceOutcome): string {
  const parts = [`${outcome.added} added`];
  if (outcome.skipped) parts.push(`${outcome.skipped} skipped`);
  if (outcome.invalid) parts.push(`${outcome.invalid} invalid`);
  if (outcome.failed) parts.push(`${outcome.failed} failed`);
  return parts.join(" · ");
}

export default function AddSourceDialog({
  isOpen,
  sources,
  pending,
  onClose,
  onCreate,
  onBulk,
  onNotice,
}: AddSourceDialogProps) {
  const [mode, setMode] = useState<SourceMode>("single");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("scholarship");
  const [tier, setTier] = useState(2);
  const [parentId, setParentId] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(
    () => sources.filter((source) => source.is_group),
    [sources],
  );

  useEffect(() => {
    if (!isOpen) return;
    setMode("single");
    setName("");
    setUrl("");
    setCategory("scholarship");
    setTier(2);
    setParentId("");
    setBulkText("");
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const close = () => {
    if (!pending) onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const defaults: BulkSourceDefaults = {
      category,
      tier,
      parentId: parentId ? Number(parentId) : null,
    };

    try {
      if (mode === "group") {
        if (!trimmedName) throw new Error("Give the source group a name.");

        const group = await onCreate({
          name: trimmedName,
          category,
          tier,
          enabled: true,
          is_group: true,
          parent_id: null,
        });
        if (!group.data?.id) {
          throw new Error("The group was created without an identifier.");
        }

        if (bulkText.trim()) {
          const outcome = await onBulk(bulkText, {
            ...defaults,
            parentId: group.data.id,
          });
          onNotice(
            `Group created · ${outcomeMessage(outcome)}`,
            outcome.failed || outcome.invalid ? "warning" : "success",
          );
        } else {
          onNotice("Source group created.", "success");
        }
        onClose();
        return;
      }

      if (!trimmedName && trimmedUrl) {
        throw new Error("Give the source a readable name.");
      }
      if (!trimmedUrl && !bulkText.trim()) {
        throw new Error("Add a URL or paste one or more source lines.");
      }

      let singleAdded = 0;
      if (trimmedUrl) {
        await onCreate({
          name: trimmedName,
          url: trimmedUrl,
          category,
          tier,
          enabled: true,
          parent_id: defaults.parentId,
        });
        singleAdded = 1;
      }

      const bulkOutcome = bulkText.trim()
        ? await onBulk(bulkText, defaults)
        : { added: 0, skipped: 0, failed: 0, invalid: 0 };
      const outcome = {
        ...bulkOutcome,
        added: bulkOutcome.added + singleAdded,
      };

      onNotice(
        `Sources updated · ${outcomeMessage(outcome)}`,
        outcome.failed || outcome.invalid ? "warning" : "success",
      );
      onClose();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "The source could not be added.";
      setError(message);
      onNotice(message, "error");
    }
  };

  return (
    <div
      className="engine-dialog-backdrop"
      role="presentation"
      onMouseDown={close}
    >
      <section
        className="engine-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-source-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="engine-dialog-header">
          <div>
            <p className="engine-card-eyebrow">Source control</p>
            <h2 id="add-source-dialog-title">Add Engine source</h2>
          </div>
          <button
            type="button"
            className="engine-icon-button"
            aria-label="Close add source dialog"
            disabled={pending}
            onClick={close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <form className="engine-dialog-form" onSubmit={submit}>
          <fieldset className="engine-segmented-control">
            <legend className="sr-only">Source type</legend>
            <label>
              <input
                type="radio"
                name="source-mode"
                value="single"
                checked={mode === "single"}
                onChange={() => setMode("single")}
              />
              <Plus size={15} aria-hidden="true" />
              Sources
            </label>
            <label>
              <input
                type="radio"
                name="source-mode"
                value="group"
                checked={mode === "group"}
                onChange={() => setMode("group")}
              />
              <FolderPlus size={15} aria-hidden="true" />
              Group
            </label>
          </fieldset>

          <label className="engine-field">
            <span>{mode === "group" ? "Group name" : "Source name"}</span>
            <input
              value={name}
              required={mode === "group" || Boolean(url.trim())}
              placeholder={
                mode === "group"
                  ? "African scholarship sources"
                  : "Opportunity Desk"
              }
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          {mode === "single" ? (
            <label className="engine-field">
              <span>Primary URL</span>
              <input
                type="url"
                value={url}
                placeholder="https://example.org/opportunities"
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
          ) : null}

          <div className="engine-field-grid">
            <label className="engine-field">
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="scholarship">Scholarship</option>
                <option value="fellowship">Fellowship</option>
                <option value="internship">Internship</option>
                <option value="grant">Grant</option>
                <option value="program">Program</option>
                <option value="event">Event</option>
              </select>
            </label>
            <label className="engine-field">
              <span>Tier</span>
              <select
                value={tier}
                onChange={(event) => setTier(Number(event.target.value))}
              >
                <option value={1}>Tier 1</option>
                <option value={2}>Tier 2</option>
                <option value={3}>Tier 3</option>
              </select>
            </label>
          </div>

          {mode === "single" && groups.length > 0 ? (
            <label className="engine-field">
              <span>Source group</span>
              <select
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">No group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="engine-field">
            <span>
              {mode === "group"
                ? "Initial child sources"
                : "Additional sources"}
            </span>
            <textarea
              value={bulkText}
              rows={6}
              placeholder={
                "Name | https://example.org/listings\nhttps://another.example.org/opportunities"
              }
              onChange={(event) => setBulkText(event.target.value)}
            />
            <small>One source per line. Use “Name | URL” or a bare URL.</small>
          </label>

          {error ? (
            <p className="engine-form-error" role="alert">
              {error}
            </p>
          ) : null}

          <footer className="engine-dialog-actions">
            <button
              type="button"
              className="engine-secondary-button"
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="engine-primary-button"
              disabled={pending}
            >
              {pending
                ? "Saving…"
                : mode === "group"
                  ? "Create group"
                  : "Add sources"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
