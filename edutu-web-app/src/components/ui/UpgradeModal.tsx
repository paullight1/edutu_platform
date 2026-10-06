import { Link } from "react-router-dom";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent } from "./Dialog";
import "./upgradeModal.css";

export interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  reason?: string | null;
}

export default function UpgradeModal({ open, onClose, reason }: UpgradeModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent ariaLabel="Prepare with Edutu" aria-describedby="upgrade-prompt-description"
        overlayClassName="upgrade-prompt-overlay" className="upgrade-prompt">
        <div className="upgrade-prompt-art" aria-hidden="true">
          <img src="/images/edutu-premium-hero.png" alt="" />
        </div>
        <button type="button" onClick={onClose} aria-label="Close upgrade prompt" className="upgrade-prompt-close">
          <X size={20} aria-hidden="true" />
        </button>
        <div className="upgrade-prompt-content">
          <p className="upgrade-prompt-eyebrow"><Sparkles size={14} aria-hidden="true" /> EDUTU PREMIUM</p>
          <h2>Prepare with Edutu</h2>
          <p id="upgrade-prompt-description" className="upgrade-prompt-description">
            {reason?.replace(/\bai\b/gi, "AI") || "Turn your next opportunity into a stronger application."}
          </p>
          <ul className="upgrade-prompt-benefits">
            {[
              ["Know your next step", "Opportunity fit checks and practical guidance."],
              ["Get help preparing", "AI Coach, voice and Application Copilot."],
              ["Keep everything together", "Plans and document tools for your applications."],
            ].map(([title, description]) => (
              <li key={title}>
                <span className="upgrade-prompt-check"><Check size={15} aria-hidden="true" /></span>
                <div><strong>{title}</strong><p>{description}</p></div>
              </li>
            ))}
          </ul>
          <Link to="/upgrade" onClick={onClose} className="upgrade-prompt-action">
            View plans <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <p className="upgrade-prompt-note">Choose Lite, Pro or Scholar to suit your goals.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
