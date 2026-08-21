import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import {
  listMarketplaceAdminListings,
  reviewMarketplaceListing,
  type MarketplaceAdminListing,
} from "../lib/marketplaceAdminApi";

const STATUS_OPTIONS = ["pending", "active", "rejected", "paused"] as const;

function statusTone(status: string) {
  if (status === "active") return { background: "rgba(52,199,89,0.12)", color: "#34c759" };
  if (status === "rejected") return { background: "rgba(255,59,48,0.12)", color: "#ff453a" };
  if (status === "pending") return { background: "rgba(255,159,10,0.12)", color: "#ff9f0a" };
  return { background: "rgba(142,142,147,0.14)", color: "var(--text-secondary)" };
}

const MarketplaceReview = () => {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("pending");
  const [listings, setListings] = useState<MarketplaceAdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setListings(await listMarketplaceAdminListings(status));
    } catch (caught) {
      setListings([]);
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load marketplace moderation queue",
      );
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const sellerRiskCount = useMemo(
    () => listings.filter((listing) => !listing.sellerApproved).length,
    [listings],
  );

  const decide = async (
    listing: MarketplaceAdminListing,
    decision: "approve" | "reject",
  ) => {
    const note = notes[listing.id]?.trim();
    if (decision === "approve" && !listing.sellerApproved) {
      setError(
        "This seller is no longer approved. Restore creator/mentor approval before publishing the listing.",
      );
      return;
    }
    if (decision === "reject" && !note) {
      setError("Add a reviewer note before rejecting a listing.");
      return;
    }
    const verb = decision === "approve" ? "publish" : "reject";
    if (!window.confirm(`Confirm ${verb} for “${listing.title}”?`)) return;

    setBusyId(listing.id);
    setError(null);
    try {
      await reviewMarketplaceListing(listing.id, {
        decision,
        ...(note ? { note } : {}),
      });
      setListings((current) => current.filter((item) => item.id !== listing.id));
      setNotes((current) => {
        const next = { ...current };
        delete next[listing.id];
        return next;
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Marketplace review decision failed",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShoppingBag size={22} color="var(--primary)" />
            <h1 style={{ margin: 0, fontSize: "24px" }}>Marketplace review</h1>
          </div>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--text-tertiary)",
              fontSize: "14px",
              maxWidth: "680px",
            }}
          >
            Listings remain private until approved here. Publication re-checks
            the seller&apos;s creator or mentor approval and every decision is written
            to the admin audit log in the same transaction.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div
        className="card"
        style={{
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", flex: 1 }}>
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={status === option ? "btn-primary" : "btn-secondary"}
              onClick={() => setStatus(option)}
              style={{ textTransform: "capitalize" }}
            >
              {option}
            </button>
          ))}
        </div>
        <span style={{ color: "var(--text-tertiary)", fontSize: "13px" }}>
          {listings.length} listing{listings.length === 1 ? "" : "s"}
        </span>
      </div>

      {sellerRiskCount > 0 ? (
        <div
          className="card"
          style={{
            padding: "14px 16px",
            display: "flex",
            gap: "10px",
            alignItems: "flex-start",
            color: "#ff9f0a",
            fontSize: "13px",
          }}
        >
          <ShieldAlert size={17} style={{ flexShrink: 0 }} />
          {sellerRiskCount} listing{sellerRiskCount === 1 ? "" : "s"} belong to
          sellers who are no longer approved. The backend will reject publication.
        </div>
      ) : null}

      {error ? (
        <div
          className="card"
          style={{ padding: "14px 16px", color: "#ff453a", fontSize: "14px" }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="card" style={{ padding: "60px", textAlign: "center", color: "var(--text-tertiary)" }}>
          Loading marketplace queue…
        </div>
      ) : listings.length === 0 ? (
        <div className="card" style={{ padding: "60px", textAlign: "center" }}>
          <CheckCircle2 size={42} style={{ opacity: 0.35, marginBottom: "12px" }} />
          <p style={{ margin: 0, fontWeight: 600 }}>No {status} listings</p>
          <p style={{ margin: "6px 0 0", color: "var(--text-tertiary)", fontSize: "13px" }}>
            Nothing is hidden behind placeholder data; this view reflects the backend queue.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "14px" }}>
          {listings.map((listing) => {
            const tone = statusTone(listing.status);
            const busy = busyId === listing.id;
            return (
              <article key={listing.id} className="card" style={{ padding: "18px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: "16px",
                    alignItems: "start",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      <span
                        style={{
                          ...tone,
                          padding: "4px 9px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 700,
                          textTransform: "capitalize",
                        }}
                      >
                        {listing.status}
                      </span>
                      <span style={{ color: "var(--text-tertiary)", fontSize: "12px", textTransform: "capitalize" }}>
                        {listing.category} · {listing.type}
                      </span>
                    </div>
                    <h2 style={{ margin: "10px 0 0", fontSize: "18px" }}>{listing.title}</h2>
                    {listing.description ? (
                      <p
                        style={{
                          margin: "8px 0 0",
                          color: "var(--text-secondary)",
                          fontSize: "14px",
                          lineHeight: 1.5,
                        }}
                      >
                        {listing.description}
                      </p>
                    ) : null}
                    <div
                      style={{
                        display: "flex",
                        gap: "14px",
                        flexWrap: "wrap",
                        marginTop: "12px",
                        fontSize: "13px",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      <span style={{ display: "inline-flex", gap: "5px", alignItems: "center" }}>
                        {listing.sellerApproved ? (
                          <BadgeCheck size={14} color="#34c759" />
                        ) : (
                          <ShieldAlert size={14} color="#ff9f0a" />
                        )}
                        {listing.sellerName} · {listing.sellerApproved ? "approved" : "not approved"}
                      </span>
                      <span>{listing.price > 0 ? `${listing.price} credits` : "Free"}</span>
                      <span>{listing.enrollmentCount || 0} enrolled</span>
                      {listing.capacity ? <span>Capacity {listing.capacity}</span> : null}
                    </div>
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: "12px", whiteSpace: "nowrap" }}>
                    <Clock3 size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                    {new Date(listing.createdAt).toLocaleDateString()}
                  </div>
                </div>

                {listing.status === "pending" ? (
                  <div style={{ marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                    <label style={{ display: "grid", gap: "7px", fontSize: "13px", fontWeight: 600 }}>
                      Reviewer note
                      <textarea
                        value={notes[listing.id] || ""}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [listing.id]: event.target.value }))
                        }
                        rows={3}
                        maxLength={2000}
                        placeholder="Required for rejection; optional for approval"
                        style={{
                          width: "100%",
                          resize: "vertical",
                          background: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                          borderRadius: "10px",
                          padding: "10px 12px",
                        }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy || !listing.sellerApproved}
                        onClick={() => void decide(listing, "approve")}
                      >
                        <CheckCircle2 size={15} /> {busy ? "Saving…" : "Approve & publish"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => void decide(listing, "reject")}
                        style={{ color: "#ff453a" }}
                      >
                        <XCircle size={15} /> Reject
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MarketplaceReview;
