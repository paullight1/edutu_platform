import { WorkspaceText } from "../workspace/shared";
import { useEffect, useRef, useState } from "react";
export function useDraftRecovery<T>(
  key: string,
  value: T,
  dirty: boolean,
  enabled = true,
) {
  const [recovered, setRecovered] = useState<T | null>(null);
  const previous = useRef({ key, dirty: false });
  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = sessionStorage.getItem(key);
      setRecovered(raw ? JSON.parse(raw) : null);
    } catch {
      setRecovered(null);
    }
  }, [key, enabled]);
  useEffect(() => {
    if (!enabled) return;
    try {
      if (dirty) {
        const serialized = JSON.stringify(value);
        if (serialized.length < 500000) sessionStorage.setItem(key, serialized);
      } else if (previous.current.key === key && previous.current.dirty) {
        sessionStorage.removeItem(key);
        setRecovered(null);
      }
      previous.current = { key, dirty };
    } catch {
      /* Storage may be disabled; server saving remains available. */
    }
  }, [key, value, dirty, enabled]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      const link = (e.target as HTMLElement)?.closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.download) return;
      if (link.href === window.location.href) return;
      if (
        !window.confirm(
          "You have unsaved edits. Leave this page? A recovery copy stays in this browser tab.",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  const discard = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* Resource may already be released. */
    }
    setRecovered(null);
  };
  return { recovered, discard };
}
export function DraftRecovery({
  onRestore,
  onDiscard,
}: {
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="feature-notice mb-4" role="status">
      <WorkspaceText value="unsavedEditsFromThisBrowserTabAreAvailable" />{" "}
      <button className="feature-button secondary" onClick={onRestore}>
        <WorkspaceText value="restoreDraft" />
      </button>{" "}
      <button className="feature-button secondary" onClick={onDiscard}>
        <WorkspaceText value="discardRecoveryCopy" />
      </button>
    </div>
  );
}
