import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal semantics provide focus containment and inert page content. */
export function CvDialog({ title, children, footer, onClose, busy = false, closeLabel = "Close" }: {
  title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; busy?: boolean; closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    const focused = document.activeElement as HTMLElement | null;
    node?.showModal?.();
    const update = () => {
      const viewport = window.visualViewport;
      if (node && viewport) {
        node.style.setProperty("--cv-viewport-height", `${viewport.height}px`);
        node.style.setProperty("--cv-viewport-top", `${viewport.offsetTop}px`);
      }
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      node?.close?.();
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      focused?.focus();
    };
  }, []);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>(".cv-dialog-header button")?.focus();
    const body = ref.current?.querySelector<HTMLElement>(".cv-dialog-body");
    if (body) body.scrollTop = 0;
  }, [title]);
  return <dialog ref={ref} open={typeof HTMLDialogElement.prototype.showModal !== "function"}
    className="cv-dialog" aria-label={title} aria-modal="true"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="cv-dialog-surface">
      <header className="cv-dialog-header"><h2>{title}</h2><button className="cv-icon-button" aria-label={closeLabel} disabled={busy} onClick={onClose}><X size={20}/></button></header>
      <div className="cv-dialog-body" aria-busy={busy}>{children}</div>
      {footer && <footer className="cv-dialog-footer">{footer}</footer>}
    </div>
  </dialog>;
}
