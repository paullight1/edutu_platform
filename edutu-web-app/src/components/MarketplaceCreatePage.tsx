import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  createMarketplaceListing,
  type MarketplaceListingInput,
} from "../services/marketplace";

export default function MarketplaceCreatePage() {
  const { getToken } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("mentorship");
  const [type, setType] = useState<"free" | "paid" | "credit" | "course">("free");
  const [price, setPrice] = useState("0");
  const [capacity, setCapacity] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const parsedPrice = useMemo(() => Math.max(0, Math.trunc(Number(price) || 0)), [price]);
  const parsedCapacity = useMemo(() => {
    if (!capacity.trim()) return undefined;
    const value = Math.trunc(Number(capacity));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }, [capacity]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      setError("Add a title before submitting.");
      return;
    }
    if ((type === "paid" || type === "credit") && parsedPrice <= 0) {
      setError("Paid listings need a credit price greater than zero.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session has expired. Sign in again.");

      const payload: MarketplaceListingInput = {
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        category,
        type,
        price: type === "free" ? 0 : parsedPrice,
        ...(parsedCapacity ? { capacity: parsedCapacity } : {}),
        ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {}),
        ...(previewUrl.trim() ? { previewUrl: previewUrl.trim() } : {}),
        ...(tags.trim()
          ? {
              tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
                .slice(0, 20),
            }
          : {}),
      };

      await createMarketplaceListing(payload, token);
      setSubmitted(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to submit this marketplace listing.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[28px] border border-success/30 bg-success/10 p-8 text-center shadow-soft">
          <CheckCircle2 size={42} className="mx-auto text-success" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-semibold text-text-primary">
            Listing submitted for review
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-text-secondary">
            It is not public yet. Edutu will review the listing and re-check your
            creator approval before it can become active in the marketplace.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/app/marketplace"
              className="inline-flex h-11 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white no-underline"
            >
              Back to marketplace
            </Link>
            <Link
              to="/mentor/dashboard"
              className="inline-flex h-11 items-center rounded-xl border border-subtle bg-surface-layer px-4 text-sm font-bold text-text-secondary no-underline"
            >
              Creator dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link
        to="/app/marketplace"
        className="inline-flex items-center gap-2 text-sm font-bold text-text-muted no-underline transition hover:text-brand"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Marketplace
      </Link>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <form
          onSubmit={(event) => void submit(event)}
          className="rounded-[28px] border border-subtle bg-surface-layer p-6 shadow-soft sm:p-8"
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
              Creator listing
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text-primary">
              Submit something genuinely useful
            </h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              New listings begin as pending and are not shown publicly until an
              administrator approves them.
            </p>
          </div>

          <div className="mt-7 grid gap-5">
            <label className="grid gap-2 text-sm font-semibold text-text-secondary">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={180}
                required
                className="h-11 rounded-xl border border-subtle bg-surface-body px-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder="e.g. Scholarship application review clinic"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-text-secondary">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={5000}
                rows={6}
                className="resize-y rounded-xl border border-subtle bg-surface-body p-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder="Explain what learners receive, who this is for and what the boundaries are."
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-text-secondary">
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="h-11 rounded-xl border border-subtle bg-surface-body px-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                >
                  <option value="mentorship">Mentorship</option>
                  <option value="career">Career</option>
                  <option value="course">Course</option>
                  <option value="event">Event</option>
                  <option value="resource">Resource</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-text-secondary">
                Type
                <select
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as "free" | "paid" | "credit" | "course")
                  }
                  className="h-11 rounded-xl border border-subtle bg-surface-body px-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                >
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="credit">Credit access</option>
                  <option value="course">Course</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold text-text-secondary">
                Price in credits
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  type="number"
                  min={0}
                  max={1000000}
                  disabled={type === "free"}
                  className="h-11 rounded-xl border border-subtle bg-surface-body px-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold text-text-secondary">
                Capacity (optional)
                <input
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  type="number"
                  min={1}
                  max={100000}
                  className="h-11 rounded-xl border border-subtle bg-surface-body px-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                  placeholder="Unlimited"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-text-secondary">
              Cover image URL (optional)
              <input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                type="url"
                className="h-11 rounded-xl border border-subtle bg-surface-body px-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-text-secondary">
              Preview URL (optional)
              <input
                value={previewUrl}
                onChange={(event) => setPreviewUrl(event.target.value)}
                type="url"
                className="h-11 rounded-xl border border-subtle bg-surface-body px-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-text-secondary">
              Tags (comma-separated)
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                className="h-11 rounded-xl border border-subtle bg-surface-body px-3 text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                placeholder="scholarships, interview prep, CV"
              />
            </label>
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Send size={17} aria-hidden="true" />
            )}
            Submit for review
          </button>
        </form>

        <aside className="h-fit rounded-[24px] border border-subtle bg-surface-layer p-5 shadow-soft lg:sticky lg:top-24">
          <div className="flex items-center gap-2 text-brand">
            <ShieldCheck size={18} aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-text-primary">
              Review rules
            </h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-text-secondary">
            <li>Only approved creators or mentors can submit listings.</li>
            <li>Every listing starts pending and requires administrator review.</li>
            <li>Creator approval is rechecked before a listing is published.</li>
            <li>Credit transfers happen only after a learner enrolls.</li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
