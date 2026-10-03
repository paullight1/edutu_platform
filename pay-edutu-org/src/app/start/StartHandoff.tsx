"use client";

import { useEffect, useRef, useState } from "react";
import { bachsCheckoutUrl } from "@/lib/auth";

export function StartHandoff() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    // Remove the code before requests, navigation or displaying any account data.
    window.history.replaceState(null, "", "/start");
    if (!code || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
      setError(
        "This payment link is missing or expired. Return to Edutu to request a new link.",
      );
      return;
    }
    void (async () => {
      try {
        const response = await fetch("/api/auth/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ code }),
        });
        const body = await response.json().catch(() => null);
        const url =
          body?.url === "/account" || body?.url === "/result"
            ? body.url
            : bachsCheckoutUrl(body?.url);
        if (!response.ok || !url) {
          setError(
            "This payment link could not be used. Return to Edutu and continue with the same purchase to request a fresh link.",
          );
          return;
        }
        window.location.replace(url);
      } catch {
        setError(
          "We could not open your payment right now. Return to Edutu and continue with the same purchase to request a fresh link.",
        );
      }
    })();
  }, []);
  return (
    <div className="card center">
      <div className="eyebrow">Edutu payments</div>
      <h1>{error ? "Payment link unavailable" : "Opening your payment"}</h1>
      {error ? (
        <p role="alert">{error}</p>
      ) : (
        <p role="status">Establishing secure account access…</p>
      )}
      {error ? (
        <a className="btn" href="https://app.edutu.org/app/wallet">
          Return to Edutu
        </a>
      ) : null}
    </div>
  );
}
