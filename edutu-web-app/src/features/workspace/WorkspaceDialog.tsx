import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./tools.css";

export function WorkspaceDialog({ title, children, footer, onClose, busy = false }: {
  title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    dialog?.showModal?.();
    const resize = () => {
      const viewport = window.visualViewport;
      if (viewport && dialog) {
        dialog.style.setProperty("--tool-height", `${viewport.height}px`);
        dialog.style.setProperty("--tool-top", `${viewport.offsetTop}px`);
      }
    };
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      dialog?.close?.(); trigger?.focus();
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
    };
  }, []);
  return <dialog ref={ref} className="tool-dialog" aria-label={title} aria-modal="true"
    open={typeof HTMLDialogElement.prototype.showModal !== "function"}
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="tool-dialog-surface"><header><h2>{title}</h2><button className="tool-icon-button" aria-label="Close" disabled={busy} onClick={onClose}><X size={20}/></button></header>
      <div className="tool-dialog-body" aria-busy={busy}>{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  </dialog>;
}
export function ToolError({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  return error ? <div className="feature-error" role="alert"><p>{error}</p>{onRetry && <button className="feature-button secondary" onClick={onRetry}>Try again</button>}</div> : null;
}
