import { paidToolPath } from "./paidRoutes";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowUpRight, Loader2 } from "lucide-react";
import {
  ProductApiError,
  productApiRequest,
  isUpgradeRequiredError,
} from "../../services/productApi";
import "./workspace.css";
export function useProductSession() {
  const { getToken, userId } = useAuth();
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    if (lifetime.current.signal.aborted)
      lifetime.current = new AbortController();
    const active = lifetime.current;
    return () =>
      active.abort(new DOMException("Workspace session changed", "AbortError"));
  }, [userId]);
  const token = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
    const active = lifetime.current;
    if (!userId) throw new Error("Sign in to open your workspace.");
    active.signal.throwIfAborted();
    const value = await (options.forceRefresh ? getToken({ skipCache: true }) : getToken());
    active.signal.throwIfAborted();
    if (!value) throw new Error("Your session expired. Sign in again.");
    return value;
  }, [getToken, userId]);
  const request = useCallback(
    async <T,>(
      path: string,
      options: RequestInit & { timeoutMs?: number } = {},
    ) => {
      const active = lifetime.current;
      const controller = new AbortController();
      const abortSession = () => controller.abort(active.signal.reason);
      const abortCaller = () => controller.abort(options.signal?.reason);
      active.signal.throwIfAborted();
      options.signal?.throwIfAborted();
      active.signal.addEventListener("abort", abortSession, { once: true });
      options.signal?.addEventListener("abort", abortCaller, { once: true });
      try {
        const requestOptions = { ...options, signal: controller.signal };
        try {
          return await productApiRequest<T>(paidToolPath(path), await token(), requestOptions);
        } catch (error) {
          const method = (options.method || "GET").toUpperCase();
          if (!(error instanceof ProductApiError) || error.status !== 401 || !["GET", "HEAD"].includes(method)) {
            throw error;
          }

          // Clerk can keep returning a cached JWT after the API has rejected
          // it. Retry safe reads once with a fresh token; never replay writes
          // such as checkout creation or payment-status mutations.
          active.signal.throwIfAborted();
          options.signal?.throwIfAborted();
          return await productApiRequest<T>(paidToolPath(path), await token({ forceRefresh: true }), requestOptions);
        }
      } finally {
        active.signal.removeEventListener("abort", abortSession);
        options.signal?.removeEventListener("abort", abortCaller);
      }
    },
    [token],
  );
  return { request, token, userId };
}
export function FeaturePage({
  eyebrow,
  title,
  description,
  actions,
  children,
  className = "",
}: {
  className?: string;
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className={`feature-workspace ${className}`}>
      <header className="feature-heading">
        <div>
          {eyebrow && <p className="feature-eyebrow">
            {t(`workspace.${eyebrow}`, { defaultValue: eyebrow })}
          </p>}
          <h1>{t(`workspace.${title}`, { defaultValue: title })}</h1>
          {description && <p className="feature-description">
            {t(`workspace.${description}`, { defaultValue: description })}
          </p>}
        </div>
        <div className="feature-actions">{actions}</div>
      </header>
      {children}
    </section>
  );
}
export function FeatureError({
  error,
  onRetry,
}: {
  error: string | null;
  onRetry?: () => void;
}) {
  return error ? (
    <div className="feature-error" role="alert">
      <p>{error}</p>
      {onRetry && (
        <button className="feature-button secondary" onClick={onRetry}>
          Try again
        </button>
      )}
      <Link to="/app/wallet">
        View access and credits <ArrowUpRight size={14} />
      </Link>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="feature-loading" role="status">
      <Loader2 className="animate-spin" size={20} /> Loading your workspace…
    </div>
  );
}
export function errorMessage(e: unknown) {
  if (isUpgradeRequiredError(e))
    return `${e.message} Visit your wallet to review access. A credit purchase does not reset a daily plan limit.`;
  return e instanceof Error
    ? e.message
    : "Something went wrong. Your work has been preserved.";
}
export const json = (value: unknown) => JSON.stringify(value);

export function WorkspaceText({ value }: { value: string }) {
  const { t } = useTranslation();
  return <>{t("workspaceCopy." + value)}</>;
}
