import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import PublicEditorialShell from "./PublicEditorialShell";
import {
  getMentorDashboard,
  getMentorStatus,
  type MentorDashboard,
} from "../services/mentor";

type Load = "loading" | "ready" | "unapproved" | "error";

export default function MentorDashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [state, setState] = useState<Load>("loading");
  const [data, setData] = useState<MentorDashboard | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const token = await getToken();
      if (!token) throw new Error("Unable to read your session.");
      try {
        const dashboard = await getMentorDashboard(token);
        setData(dashboard);
        setState("ready");
      } catch (err) {
        if ((err as { status?: number }).status === 403) {
          // Not approved yet — fall back to showing the application status.
          const status = await getMentorStatus(token).catch(() => null);
          setStatusLabel(status?.status ?? "none");
          setState("unapproved");
        } else {
          setState("error");
        }
      }
    } catch {
      setState("error");
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <PublicEditorialShell>
        <div className="mx-auto max-w-4xl px-4 py-16 text-text-secondary">
          {t("mentorDashboard.loading", { defaultValue: "Loading your Mentor Studio…" })}
        </div>
      </PublicEditorialShell>
    );
  }

  if (state === "error") {
    return (
      <PublicEditorialShell>
        <div className="mx-auto max-w-4xl px-4 py-16">
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {t("mentorDashboard.error", { defaultValue: "We couldn't load your dashboard." })}
          </div>
          <button
            onClick={() => void load()}
            className="mt-4 rounded-lg bg-brand px-4 py-2 text-white"
          >
            {t("common.retry", { defaultValue: "Retry" })}
          </button>
        </div>
      </PublicEditorialShell>
    );
  }

  if (state === "unapproved") {
    return (
      <PublicEditorialShell>
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-text-primary">
            {t("mentorDashboard.title", { defaultValue: "Mentor Studio" })}
          </h1>
          <p className="mt-3 text-text-secondary">
            {statusLabel === "pending"
              ? t("mentorDashboard.pending", {
                  defaultValue:
                    "Your mentor application is under review. We'll notify you once it's approved.",
                })
              : t("mentorDashboard.notMentor", {
                  defaultValue: "Become an approved mentor to publish roadmaps and resources.",
                })}
          </p>
          <button
            onClick={() => navigate("/mentor")}
            className="mt-6 rounded-lg bg-brand px-5 py-2.5 text-white"
          >
            {t("mentorDashboard.applyCta", { defaultValue: "Become a Mentor" })}
          </button>
        </div>
      </PublicEditorialShell>
    );
  }

  const s = data!.stats;
  const cards = [
    { label: t("mentorDashboard.stats.published", { defaultValue: "Published content" }), value: s.publishedContent },
    { label: t("mentorDashboard.stats.learners", { defaultValue: "Learners reached" }), value: s.learnersReached },
    { label: t("mentorDashboard.stats.earned", { defaultValue: "Credits earned" }), value: s.creditsEarned },
    { label: t("mentorDashboard.stats.rating", { defaultValue: "Avg rating" }), value: s.avgRating ?? "—" },
  ];

  return (
    <PublicEditorialShell>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">
            {t("mentorDashboard.title", { defaultValue: "Mentor Studio" })}
          </h1>
          <p className="text-text-secondary">
            {t("mentorDashboard.subtitle", { defaultValue: "Your impact and published content." })}
          </p>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-subtle bg-surface-elevated p-4">
              <div className="text-2xl font-bold text-text-primary">{c.value}</div>
              <div className="mt-1 text-xs text-text-secondary">{c.label}</div>
            </div>
          ))}
        </div>

        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold text-text-primary">
            {t("mentorDashboard.listingsTitle", { defaultValue: "Your listings" })}
          </h2>
          {data!.listings.length === 0 ? (
            <p className="text-text-secondary">
              {t("mentorDashboard.noListings", { defaultValue: "You haven't published anything yet." })}
            </p>
          ) : (
            <ul className="divide-y divide-subtle rounded-xl border border-subtle">
              {data!.listings.map((l) => (
                <li key={l.id} className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-medium text-text-primary">{l.title}</div>
                    <div className="text-xs capitalize text-text-secondary">
                      {l.category} · {l.status}
                    </div>
                  </div>
                  <div className="text-sm text-text-secondary">{l.enrollmentCount} enrolled</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PublicEditorialShell>
  );
}
